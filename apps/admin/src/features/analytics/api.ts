import { supabase } from '@/lib/supabase';

export type SummaryRow = { scopeType: string; scopeId: string | null; schoolDays: number; presentDays: number; pct: number };

export async function fetchCurrentTermId(): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('terms').select('id').lte('starts_on', today).gte('ends_on', today).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function fetchSummaries(termId: string, scopeType: 'school' | 'grade' | 'class'): Promise<SummaryRow[]> {
  const { data, error } = await supabase
    .from('attendance_summaries')
    .select('scope_type, scope_id, school_days, present_days, pct')
    .eq('term_id', termId)
    .eq('scope_type', scopeType);
  if (error) throw error;
  return (data ?? []).map((r) => ({ scopeType: r.scope_type, scopeId: r.scope_id, schoolDays: r.school_days, presentDays: r.present_days, pct: r.pct }));
}

export async function fetchGradeNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('grades').select('id, name');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const g of data ?? []) map[g.id] = g.name;
  return map;
}

export type AtRiskStudent = { studentId: string; fullName: string; className: string; consecutiveAbsentDays: number; termPct: number };

/** FR-ANL-02: "students at risk by consecutive absence or low attendance are listed, most severe first." */
type AtRiskRpcRow = { student_id: string; full_name: string; class_name: string; consecutive_absent_days: number; term_pct: number };

export async function fetchStudentsAtRisk(): Promise<AtRiskStudent[]> {
  // .returns<T[]>() fights with the client's own inference for a set-returning
  // RPC call (see fetchMarkingStatus's comment in attendance/api.ts) — cast after the await instead.
  const { data, error } = await supabase.rpc('students_at_risk');
  if (error) throw error;
  const rows = (data ?? []) as unknown as AtRiskRpcRow[];
  return rows.map((r) => ({
    studentId: r.student_id,
    fullName: r.full_name,
    className: r.class_name,
    consecutiveAbsentDays: r.consecutive_absent_days,
    termPct: r.term_pct,
  }));
}

export async function exportAttendanceSummary(termId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string; row_count: number }>(
    `export-report?report=attendance_summary&term_id=${termId}`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('Export failed');
  return data.url;
}

/** FR-ANL-04: "attendance AND marks reports may be exported in a spreadsheet format." */
export async function exportMarksSummary(termId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string; row_count: number }>(
    `export-report?report=marks_summary&term_id=${termId}`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('Export failed');
  return data.url;
}
