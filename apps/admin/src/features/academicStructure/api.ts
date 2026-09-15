import { supabase } from '@/lib/supabase';

export type Grade = { id: string; number: number; name: string };

export async function listGrades(): Promise<Grade[]> {
  const { data, error } = await supabase.from('grades').select('id, number, name').order('number');
  if (error) throw error;
  return data ?? [];
}

export async function addGrade(number: number, name: string): Promise<void> {
  const { error } = await supabase.from('grades').insert({ number, name });
  if (error) throw error;
}

export async function updateGrade(id: string, number: number, name: string): Promise<void> {
  const { error } = await supabase.from('grades').update({ number, name }).eq('id', id);
  if (error) throw error;
}

/** Fails with a foreign key violation (Postgres code 23503) while any class or subject still references this grade — that's the "only when unlinked" rule, enforced by the DB schema itself rather than a pre-check here. */
export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase.from('grades').delete().eq('id', id);
  if (error) throw error;
}

/** Backs the Delete icon's visibility, not the delete itself — see grade_can_delete (20260915000000_grade_class_can_delete.sql). */
export async function canDeleteGrade(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('grade_can_delete', { p_grade_id: id });
  if (error) throw error;
  return data ?? false;
}

export type Subject = { id: string; name: string; code: string | null; gradeIds: string[] };

export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name, code, grade_subjects(grade_id)')
    .order('name')
    .returns<{ id: string; name: string; code: string | null; grade_subjects: { grade_id: string }[] }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, code: r.code, gradeIds: r.grade_subjects.map((g) => g.grade_id) }));
}

export async function addSubject(name: string, code: string | undefined, gradeIds: string[]): Promise<void> {
  const { data, error } = await supabase.from('subjects').insert({ name, code: code || null }).select('id').single();
  if (error) throw error;
  if (gradeIds.length > 0) {
    const { error: linkError } = await supabase.from('grade_subjects').insert(gradeIds.map((gradeId) => ({ subject_id: data.id, grade_id: gradeId })));
    if (linkError) throw linkError;
  }
}

export async function updateSubject(id: string, name: string, code: string | undefined, gradeIds: string[]): Promise<void> {
  const { error } = await supabase.from('subjects').update({ name, code: code || null }).eq('id', id);
  if (error) throw error;
  const { error: delError } = await supabase.from('grade_subjects').delete().eq('subject_id', id);
  if (delError) throw delError;
  if (gradeIds.length > 0) {
    const { error: linkError } = await supabase.from('grade_subjects').insert(gradeIds.map((gradeId) => ({ subject_id: id, grade_id: gradeId })));
    if (linkError) throw linkError;
  }
}

/** Fails with a foreign key violation (Postgres code 23503) while any grade, class, or mark sheet still references this subject — that's the "only when unlinked" rule, enforced by the DB schema itself rather than a pre-check here. */
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw error;
}

/** Backs the Delete icon's visibility, not the delete itself — see subject_can_delete (20260915010000_subject_can_delete.sql). */
export async function canDeleteSubject(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('subject_can_delete', { p_subject_id: id });
  if (error) throw error;
  return data ?? false;
}

export type ClassRow = { id: string; name: string; gradeId: string; gradeNumber: number; classTeacherId: string | null; classTeacherName: string | null };

export async function listClassesForCurrentYear(): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grade_id, grades(number), class_teacher_id, staff(full_name), academic_years!inner(is_current)')
    .eq('academic_years.is_current', true)
    .order('name')
    .returns<{ id: string; name: string; grade_id: string; grades: { number: number } | null; class_teacher_id: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    gradeId: r.grade_id,
    gradeNumber: r.grades?.number ?? 0,
    classTeacherId: r.class_teacher_id,
    classTeacherName: r.staff?.full_name ?? null,
  }));
}

export async function addClass(input: { gradeId: string; name: string; academicYearId: string; classTeacherId?: string | null }): Promise<void> {
  const { error } = await supabase.from('classes').insert({
    grade_id: input.gradeId,
    name: input.name,
    academic_year_id: input.academicYearId,
    class_teacher_id: input.classTeacherId || null,
  });
  if (error) throw error;
}

/** Same shape as listClassesForCurrentYear, but for a specific year — used by the promotion flow to see what already exists in the year students are being promoted into. */
export async function listClassesForYear(academicYearId: string): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grade_id, grades(number), class_teacher_id, staff(full_name)')
    .eq('academic_year_id', academicYearId)
    .order('name')
    .returns<{ id: string; name: string; grade_id: string; grades: { number: number } | null; class_teacher_id: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    gradeId: r.grade_id,
    gradeNumber: r.grades?.number ?? 0,
    classTeacherId: r.class_teacher_id,
    classTeacherName: r.staff?.full_name ?? null,
  }));
}

/**
 * Returns an existing class's id if `academicYearId` already has one named
 * `name` in the same grade, else creates it. Used by the promotion flow so
 * mapping the same destination class for several source classes (or
 * re-running promotion) never tries to create a duplicate. Class names are
 * only unique per year (not per grade), so a name typed for one grade could
 * collide with an unrelated class in another grade — that's treated as a
 * naming conflict rather than silently reusing the wrong grade's class.
 */
export async function ensureClassForYear(input: { academicYearId: string; gradeId: string; name: string }): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('classes')
    .select('id, grade_id')
    .eq('academic_year_id', input.academicYearId)
    .eq('name', input.name)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    const found = existing as { id: string; grade_id: string };
    if (found.grade_id !== input.gradeId) {
      throw new Error(`A class named "${input.name}" already exists in this year for a different grade — choose another name.`);
    }
    return found.id;
  }

  const { data: created, error: insertError } = await supabase
    .from('classes')
    .insert({ grade_id: input.gradeId, name: input.name, academic_year_id: input.academicYearId })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return (created as { id: string }).id;
}

export async function setClassTeacher(classId: string, staffId: string | null): Promise<void> {
  const { error } = await supabase.from('classes').update({ class_teacher_id: staffId }).eq('id', classId);
  if (error) throw error;
}

export async function updateClass(id: string, input: { gradeId: string; name: string; classTeacherId?: string | null }): Promise<void> {
  const { error } = await supabase
    .from('classes')
    .update({ grade_id: input.gradeId, name: input.name, class_teacher_id: input.classTeacherId ?? null })
    .eq('id', id);
  if (error) throw error;
}

/** Fails with a foreign key violation (Postgres code 23503) while any enrolment, attendance, or marks row still references this class — that's the "only when unlinked" rule, enforced by the DB schema itself rather than a pre-check here. class_subject_teachers rows cascade-delete along with the class since that join table is purely derived from it. */
export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw error;
}

/** Backs the Delete icon's visibility, not the delete itself — see class_can_delete (20260915000000_grade_class_can_delete.sql). */
export async function canDeleteClass(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('class_can_delete', { p_class_id: id });
  if (error) throw error;
  return data ?? false;
}

export type ClassSubjectTeacherRow = { id: string; classId: string; className: string; subjectId: string; subjectName: string; staffId: string; staffName: string };

export async function listClassSubjectTeachers(classId?: string): Promise<ClassSubjectTeacherRow[]> {
  let query = supabase
    .from('class_subject_teachers')
    .select('id, class_id, classes(name), subject_id, subjects(name), staff_id, staff(full_name)')
    .order('id');
  if (classId) query = query.eq('class_id', classId);
  const { data, error } = await query.returns<
    { id: string; class_id: string; classes: { name: string } | null; subject_id: string; subjects: { name: string } | null; staff_id: string; staff: { full_name: string } | null }[]
  >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    classId: r.class_id,
    className: r.classes?.name ?? '',
    subjectId: r.subject_id,
    subjectName: r.subjects?.name ?? '',
    staffId: r.staff_id,
    staffName: r.staff?.full_name ?? '',
  }));
}

/** FR-MRK-01: "each class-subject pairing has an assigned teacher." Upserts so re-assigning a subject just replaces the previous teacher. */
export async function assignClassSubjectTeacher(classId: string, subjectId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('class_subject_teachers')
    .upsert({ class_id: classId, subject_id: subjectId, staff_id: staffId }, { onConflict: 'class_id,subject_id' });
  if (error) throw error;
}

export async function removeClassSubjectTeacher(id: string): Promise<void> {
  const { error } = await supabase.from('class_subject_teachers').delete().eq('id', id);
  if (error) throw error;
}

// Academic year/term creation and the working-weekday pattern live in
// features/calendar/api.ts alongside the rest of AcademicCalendarScreen's
// data — this file stays scoped to grades/classes/subjects/teacher
// assignments (screen #42, "Classes, subjects and terms").
