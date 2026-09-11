import { supabase } from '@/lib/supabase';
import type { MarkRow } from '@/features/marks/api';

export type YearClass = { id: string; name: string; gradeName: string; gradeNumber: number; examCount: number };

/**
 * Classes for a specific academic year — unlike students/api.ts's listClasses
 * (always the current year), this drives the year picker on ExamsScreen. Each
 * row also carries its exam count so the class list can show "N exams" up
 * front, before the user drills into any one class.
 */
export async function listClassesForYear(academicYearId: string): Promise<YearClass[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grades(number, name)')
    .eq('academic_year_id', academicYearId)
    .order('name')
    .returns<{ id: string; name: string; grades: { number: number; name: string } | null }[]>();
  if (error) throw error;
  const classes = data ?? [];
  if (classes.length === 0) return [];

  const { data: sheetRows, error: sheetsError } = await supabase
    .from('mark_sheets')
    .select('class_id')
    .in('class_id', classes.map((c) => c.id))
    .returns<{ class_id: string }[]>();
  if (sheetsError) throw sheetsError;
  const examCounts = new Map<string, number>();
  for (const r of sheetRows ?? []) examCounts.set(r.class_id, (examCounts.get(r.class_id) ?? 0) + 1);

  return classes.map((r) => ({
    id: r.id,
    name: r.name,
    gradeNumber: r.grades?.number ?? 0,
    gradeName: r.grades?.name ?? '',
    examCount: examCounts.get(r.id) ?? 0,
  }));
}

export async function countRosterForClass(classId: string): Promise<number> {
  const { count, error } = await supabase.from('student_enrolments').select('id', { count: 'exact', head: true }).eq('class_id', classId);
  if (error) throw error;
  return count ?? 0;
}

export type ExamCard = {
  markSheetId: string;
  subjectName: string;
  termName: string;
  termSequence: number;
  status: 'draft' | 'submitted' | 'reopened';
  maxScore: number;
  enteredCount: number;
};

/** Each mark_sheets row (a class+subject+term combination) is one "exam" card — there is no separate exams table. */
export async function listExamsForClass(classId: string): Promise<ExamCard[]> {
  const { data, error } = await supabase
    .from('mark_sheets')
    .select('id, status, max_score, subjects(name), terms(name, sequence)')
    .eq('class_id', classId)
    .returns<{ id: string; status: string; max_score: number; subjects: { name: string } | null; terms: { name: string; sequence: number } | null }[]>();
  if (error) throw error;
  const sheets = data ?? [];
  if (sheets.length === 0) return [];

  const { data: markRows, error: marksError } = await supabase
    .from('marks')
    .select('mark_sheet_id, score')
    .in('mark_sheet_id', sheets.map((s) => s.id))
    .returns<{ mark_sheet_id: string; score: number | null }[]>();
  if (marksError) throw marksError;

  const enteredCounts = new Map<string, number>();
  for (const m of markRows ?? []) {
    if (m.score != null) enteredCounts.set(m.mark_sheet_id, (enteredCounts.get(m.mark_sheet_id) ?? 0) + 1);
  }

  return sheets
    .map((s) => ({
      markSheetId: s.id,
      subjectName: s.subjects?.name ?? '',
      termName: s.terms?.name ?? '',
      termSequence: s.terms?.sequence ?? 0,
      status: s.status as ExamCard['status'],
      maxScore: s.max_score,
      enteredCount: enteredCounts.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.termSequence - b.termSequence || a.subjectName.localeCompare(b.subjectName));
}

export type ExamDetail = {
  markSheetId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  termName: string;
  status: 'draft' | 'submitted' | 'reopened';
  maxScore: number;
  /** ISO timestamp of the most recent reopen_mark_sheet() call, if any — persists across the immediate reopened->draft flip, so it stays available to show "reopened just now" even once status reads back as draft. */
  reopenedAt: string | null;
};

export async function fetchExamDetail(markSheetId: string): Promise<ExamDetail> {
  const { data, error } = await supabase
    .from('mark_sheets')
    .select('id, class_id, subject_id, term_id, status, max_score, reopened_at, classes(name), subjects(name), terms(name)')
    .eq('id', markSheetId)
    .single()
    .returns<{
      id: string;
      class_id: string;
      subject_id: string;
      term_id: string;
      status: string;
      max_score: number;
      reopened_at: string | null;
      classes: { name: string } | null;
      subjects: { name: string } | null;
      terms: { name: string } | null;
    }>();
  if (error) throw error;
  return {
    markSheetId: data.id,
    classId: data.class_id,
    className: data.classes?.name ?? '',
    subjectId: data.subject_id,
    subjectName: data.subjects?.name ?? '',
    termId: data.term_id,
    termName: data.terms?.name ?? '',
    status: data.status as ExamDetail['status'],
    maxScore: data.max_score,
    reopenedAt: data.reopened_at,
  };
}

export type ExamAnalytics = {
  rosterCount: number;
  enteredCount: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  topStudentName: string | null;
  bottomStudentName: string | null;
};

/** Pure summary over a fetched marks list — no extra round trip, since ExamMarksScreen already holds the same rows for the roster list below the report card. */
export function computeExamAnalytics(rows: MarkRow[]): ExamAnalytics {
  const scored = rows.filter((r): r is MarkRow & { score: number } => r.score != null);
  const average = scored.length > 0 ? Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 100) / 100 : null;
  const top = scored.reduce<MarkRow | null>((best, r) => (!best || r.score > (best.score as number) ? r : best), null);
  const bottom = scored.reduce<MarkRow | null>((worst, r) => (!worst || r.score < (worst.score as number) ? r : worst), null);
  return {
    rosterCount: rows.length,
    enteredCount: scored.length,
    average,
    highest: top?.score ?? null,
    lowest: bottom?.score ?? null,
    topStudentName: top?.fullName ?? null,
    bottomStudentName: bottom?.fullName ?? null,
  };
}

export type ScoreBand = { label: string; count: number; tone: 'error' | 'warning' | 'success' };

/** Buckets entered scores into the same 0-39/40-74/75-100 bands StudentProfileScreen already colors its per-subject bars with, so the report card's distribution chart reads as one consistent scale across the app. */
export function computeScoreDistribution(rows: MarkRow[], maxScore: number): ScoreBand[] {
  const bands: ScoreBand[] = [
    { label: '0-39%', count: 0, tone: 'error' },
    { label: '40-74%', count: 0, tone: 'warning' },
    { label: '75-100%', count: 0, tone: 'success' },
  ];
  if (!maxScore) return bands;
  for (const r of rows) {
    if (r.score == null) continue;
    const pct = (r.score / maxScore) * 100;
    const band = pct >= 75 ? bands[2] : pct >= 40 ? bands[1] : bands[0];
    band.count += 1;
  }
  return bands;
}
