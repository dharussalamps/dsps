import { supabase } from '@/lib/supabase';

export type SubjectOption = { subjectId: string; name: string };

/** Subjects available for a class's grade (grade_subjects) — the simplest reliable picker source; class_subject_teachers assignments may not exist yet for every class. */
export async function listSubjectsForClass(classId: string): Promise<SubjectOption[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('grade_id, grades(grade_subjects(subjects(id, name)))')
    .eq('id', classId)
    .maybeSingle()
    .returns<{ grade_id: string; grades: { grade_subjects: { subjects: { id: string; name: string } | null }[] } | null } | null>();
  if (error) throw error;
  const list = data?.grades?.grade_subjects ?? [];
  return list.filter((g) => g.subjects != null).map((g) => ({ subjectId: g.subjects!.id, name: g.subjects!.name }));
}

export type CurrentTerm = { id: string; name: string };

export async function fetchCurrentTerm(): Promise<CurrentTerm | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('terms').select('id, name').lte('starts_on', today).gte('ends_on', today).maybeSingle();
  if (error) throw error;
  return data;
}

export type MarkSheetInfo = { id: string; status: 'draft' | 'submitted' | 'reopened'; maxScore: number };

export async function getOrCreateMarkSheet(classId: string, subjectId: string, termId: string): Promise<MarkSheetInfo> {
  const { data: existing, error: existingError } = await supabase
    .from('mark_sheets')
    .select('id, status, max_score')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { id: existing.id, status: existing.status as MarkSheetInfo['status'], maxScore: existing.max_score };

  const { data: created, error: createError } = await supabase
    .from('mark_sheets')
    .insert({ class_id: classId, subject_id: subjectId, term_id: termId })
    .select('id, status, max_score')
    .single();
  if (createError) throw createError;
  return { id: created.id, status: created.status as MarkSheetInfo['status'], maxScore: created.max_score };
}

export type MarkRow = { studentId: string; fullName: string; score: number | null };

export async function fetchMarksForSheet(markSheetId: string, classId: string): Promise<MarkRow[]> {
  const [{ data: roster, error: rosterError }, { data: marks, error: marksError }] = await Promise.all([
    supabase
      .from('student_enrolments')
      .select('roll_no, students(id, full_name)')
      .eq('class_id', classId)
      .order('roll_no')
      .returns<{ roll_no: string | null; students: { id: string; full_name: string } | null }[]>(),
    supabase.from('marks').select('student_id, score').eq('mark_sheet_id', markSheetId),
  ]);
  if (rosterError) throw rosterError;
  if (marksError) throw marksError;

  const byStudent = new Map((marks ?? []).map((m) => [m.student_id, m.score]));
  return (roster ?? [])
    .filter((r) => r.students != null)
    .map((r) => ({ studentId: r.students!.id, fullName: r.students!.full_name, score: byStudent.get(r.students!.id) ?? null }));
}

/** enteredBy must be the current staff member's staff.id (not their auth user id) — RLS's write_marks policy checks entered_by = current_staff_id(). */
export async function saveMark(markSheetId: string, studentId: string, score: number | null, enteredBy: string): Promise<void> {
  const { error } = await supabase
    .from('marks')
    .upsert({ mark_sheet_id: markSheetId, student_id: studentId, score, entered_by: enteredBy }, { onConflict: 'mark_sheet_id,student_id' });
  if (error) throw error;
}

export async function submitMarkSheet(markSheetId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_mark_sheet', { p_mark_sheet_id: markSheetId });
  if (error) throw error;
}

export async function reopenMarkSheet(markSheetId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_mark_sheet', { p_mark_sheet_id: markSheetId });
  if (error) throw error;
}

export type MarkSheetSummary = {
  id: string;
  className: string;
  subjectName: string;
  termName: string;
  status: 'draft' | 'submitted' | 'reopened';
  classId: string;
  subjectId: string;
  termId: string;
};

export async function listVisibleMarkSheets(): Promise<MarkSheetSummary[]> {
  const { data, error } = await supabase
    .from('mark_sheets')
    .select('id, status, class_id, subject_id, term_id, classes(name), subjects(name), terms(name)')
    .order('status')
    .returns<
      { id: string; status: string; class_id: string; subject_id: string; term_id: string; classes: { name: string } | null; subjects: { name: string } | null; terms: { name: string } | null }[]
    >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    className: r.classes?.name ?? '',
    subjectName: r.subjects?.name ?? '',
    termName: r.terms?.name ?? '',
    status: r.status as MarkSheetSummary['status'],
    classId: r.class_id,
    subjectId: r.subject_id,
    termId: r.term_id,
  }));
}

export type StudentMarkRow = {
  subjectName: string;
  termName: string;
  score: number | null;
  maxScore: number;
  classAverage: number | null;
};

/** FR-MRK-05: "each subject shows the class average for the same subject and term beside the student's score." */
export async function fetchStudentMarks(studentId: string): Promise<StudentMarkRow[]> {
  const { data, error } = await supabase
    .from('marks')
    .select('score, mark_sheets(class_id, subject_id, term_id, max_score, subjects(name), terms(name))')
    .eq('student_id', studentId)
    .returns<
      { score: number | null; mark_sheets: { class_id: string; subject_id: string; term_id: string; max_score: number; subjects: { name: string } | null; terms: { name: string } | null } | null }[]
    >();
  if (error) throw error;

  const rows = (data ?? []).filter((r) => r.mark_sheets != null);
  return Promise.all(
    rows.map(async (r) => {
      const ms = r.mark_sheets!;
      const average = await fetchClassSubjectAverage(ms.class_id, ms.subject_id, ms.term_id);
      return {
        subjectName: ms.subjects?.name ?? '',
        termName: ms.terms?.name ?? '',
        score: r.score,
        maxScore: ms.max_score,
        classAverage: average,
      };
    }),
  );
}

export async function fetchClassSubjectAverage(classId: string, subjectId: string, termId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('class_subject_average', { p_class_id: classId, p_subject_id: subjectId, p_term_id: termId });
  if (error) throw error;
  return (data as number | null) ?? null;
}
