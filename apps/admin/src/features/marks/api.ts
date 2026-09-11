import { supabase } from '@/lib/supabase';

export type MarkEntryContext = { className: string; subjectName: string; termName: string };

/** Display context for MarkEntryScreen's header — the route only carries ids, and a single-purpose lookup here is cheaper than routing through the heavier class/subject lists elsewhere in the app. */
export async function fetchMarkEntryContext(classId: string, subjectId: string, termId: string): Promise<MarkEntryContext> {
  const [{ data: cls, error: clsError }, { data: subject, error: subjectError }, { data: term, error: termError }] = await Promise.all([
    supabase.from('classes').select('name').eq('id', classId).single(),
    supabase.from('subjects').select('name').eq('id', subjectId).single(),
    supabase.from('terms').select('name').eq('id', termId).single(),
  ]);
  if (clsError) throw clsError;
  if (subjectError) throw subjectError;
  if (termError) throw termError;
  return { className: cls.name, subjectName: subject.name, termName: term.name };
}

export type SubjectOption = { subjectId: string; name: string };

/** All subjects offered for a class's grade — used as the fallback picker source for a reviewer (sectional head/principal) who isn't necessarily any one subject's assigned teacher. */
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

/**
 * FR-MRK-01: "each class-subject pairing has an assigned teacher." A class
 * teacher entering marks should only see the subjects they're actually
 * assigned via class_subject_teachers for this class — otherwise anyone
 * holding class-scoped marks.enter could pick any subject the grade
 * offers. If this staff member has no explicit assignment row for the
 * class at all, falls back to the full grade subject list: that's the
 * sectional-head/principal case (marks.enter at grade/school scope,
 * reviewing or entering on a teacher's behalf), not a gap in the class
 * teacher's own restriction.
 */
export async function listSubjectsForTeacherInClass(classId: string, staffId: string): Promise<SubjectOption[]> {
  const { data, error } = await supabase
    .from('class_subject_teachers')
    .select('subject_id, subjects(id, name)')
    .eq('class_id', classId)
    .eq('staff_id', staffId)
    .returns<{ subject_id: string; subjects: { id: string; name: string } | null }[]>();
  if (error) throw error;
  if (data && data.length > 0) {
    return data.filter((r) => r.subjects != null).map((r) => ({ subjectId: r.subjects!.id, name: r.subjects!.name }));
  }
  return listSubjectsForClass(classId);
}

export type CurrentTerm = { id: string; name: string };

export async function fetchCurrentTerm(): Promise<CurrentTerm | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('terms').select('id, name').lte('starts_on', today).gte('ends_on', today).maybeSingle();
  if (error) throw error;
  return data;
}

export type MarkSheetInfo = { id: string; status: 'draft' | 'submitted' | 'reopened'; maxScore: number };

/** maxScore only applies the first time a class+subject+term sheet is created (the exam's "out of") — it's ignored once a sheet already exists, so re-opening an existing exam never silently rescales it. */
export async function getOrCreateMarkSheet(classId: string, subjectId: string, termId: string, maxScore?: number): Promise<MarkSheetInfo> {
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
    .insert({ class_id: classId, subject_id: subjectId, term_id: termId, ...(maxScore != null ? { max_score: maxScore } : {}) })
    .select('id, status, max_score')
    .single();
  if (createError) throw createError;
  return { id: created.id, status: created.status as MarkSheetInfo['status'], maxScore: created.max_score };
}

export type MarkRow = { studentId: string; fullName: string; rollNo: string | null; admissionNo: string; score: number | null };

export async function fetchMarksForSheet(markSheetId: string, classId: string): Promise<MarkRow[]> {
  const [{ data: roster, error: rosterError }, { data: marks, error: marksError }] = await Promise.all([
    supabase
      .from('student_enrolments')
      .select('roll_no, students(id, full_name, admission_no)')
      .eq('class_id', classId)
      .order('roll_no')
      .returns<{ roll_no: string | null; students: { id: string; full_name: string; admission_no: string } | null }[]>(),
    supabase.from('marks').select('student_id, score').eq('mark_sheet_id', markSheetId),
  ]);
  if (rosterError) throw rosterError;
  if (marksError) throw marksError;

  const byStudent = new Map((marks ?? []).map((m) => [m.student_id, m.score]));
  return (roster ?? [])
    .filter((r) => r.students != null)
    .map((r) => ({
      studentId: r.students!.id,
      fullName: r.students!.full_name,
      rollNo: r.roll_no,
      admissionNo: r.students!.admission_no,
      score: byStudent.get(r.students!.id) ?? null,
    }));
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
  score: number | null;
  maxScore: number;
  classAverage: number | null;
};

export type StudentTermMarks = {
  termId: string;
  termName: string;
  sequence: number;
  marks: StudentMarkRow[];
};

/**
 * FR-MRK-05: "each subject shows the class average for the same subject and
 * term beside the student's score." A student can have marks across every
 * term a teacher has entered them for, so rows are grouped by term (and
 * ordered by term sequence, matching the trend chart above this list) rather
 * than returned as one flat, unordered list mixing terms together.
 */
export async function fetchStudentMarks(studentId: string): Promise<StudentTermMarks[]> {
  const { data, error } = await supabase
    .from('marks')
    .select('score, mark_sheets(class_id, subject_id, term_id, max_score, subjects(name), terms(name, sequence))')
    .eq('student_id', studentId)
    .returns<
      {
        score: number | null;
        mark_sheets: {
          class_id: string;
          subject_id: string;
          term_id: string;
          max_score: number;
          subjects: { name: string } | null;
          terms: { name: string; sequence: number } | null;
        } | null;
      }[]
    >();
  if (error) throw error;

  const rows = (data ?? []).filter((r) => r.mark_sheets != null);
  const flat = await Promise.all(
    rows.map(async (r) => {
      const ms = r.mark_sheets!;
      const average = await fetchClassSubjectAverage(ms.class_id, ms.subject_id, ms.term_id);
      return {
        termId: ms.term_id,
        termName: ms.terms?.name ?? '',
        sequence: ms.terms?.sequence ?? 0,
        subjectName: ms.subjects?.name ?? '',
        score: r.score,
        maxScore: ms.max_score,
        classAverage: average,
      };
    }),
  );

  const byTerm = new Map<string, StudentTermMarks>();
  for (const row of flat) {
    const bucket = byTerm.get(row.termId) ?? { termId: row.termId, termName: row.termName, sequence: row.sequence, marks: [] };
    bucket.marks.push({ subjectName: row.subjectName, score: row.score, maxScore: row.maxScore, classAverage: row.classAverage });
    byTerm.set(row.termId, bucket);
  }

  return Array.from(byTerm.values()).sort((a, b) => a.sequence - b.sequence);
}

export async function fetchClassSubjectAverage(classId: string, subjectId: string, termId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('class_subject_average', { p_class_id: classId, p_subject_id: subjectId, p_term_id: termId });
  if (error) throw error;
  return (data as number | null) ?? null;
}

export type TermPosition = { avgScore: number | null; classPosition: number | null; classSize: number };

/** FR-MRK-06: "a student's term average and position within the class are shown." */
export async function fetchStudentTermPosition(studentId: string, termId: string): Promise<TermPosition | null> {
  const { data, error } = await supabase
    .rpc('student_class_position', { p_student_id: studentId, p_term_id: termId })
    .maybeSingle<{ avg_score: number | null; class_position: number | null; class_size: number }>();
  if (error) throw error;
  if (!data) return null;
  return { avgScore: data.avg_score, classPosition: data.class_position, classSize: data.class_size };
}

export type TermTrendPoint = { termId: string; termName: string; sequence: number; avgScore: number };

/** FR-MRK-07: "a student's average is presented across terms so that a trend is visible." */
export async function fetchStudentTermTrend(studentId: string): Promise<TermTrendPoint[]> {
  const { data, error } = await supabase.rpc('student_term_trend', { p_student_id: studentId });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { term_id: string; term_name: string; sequence: number; avg_score: number }[];
  return rows.map((r) => ({ termId: r.term_id, termName: r.term_name, sequence: r.sequence, avgScore: r.avg_score }));
}

export type OutstandingMarkSheet = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  termName: string;
  teacherName: string;
  status: 'not_started' | 'draft' | 'submitted' | 'reopened';
};

/** FR-MRK-08: "... including which mark sheets are outstanding." Includes combinations that have no mark_sheets row at all yet, not just drafts. */
type OutstandingMarkSheetRpcRow = {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  term_id: string;
  term_name: string;
  teacher_name: string;
  status: string;
};

export async function fetchOutstandingMarkSheets(termId?: string): Promise<OutstandingMarkSheet[]> {
  const { data, error } = await supabase.rpc('outstanding_mark_sheets', { p_term_id: termId ?? null });
  if (error) throw error;
  const rows = (data ?? []) as unknown as OutstandingMarkSheetRpcRow[];
  return rows.map((r) => ({
    classId: r.class_id,
    className: r.class_name,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    termId: r.term_id,
    termName: r.term_name,
    teacherName: r.teacher_name,
    status: r.status as OutstandingMarkSheet['status'],
  }));
}
