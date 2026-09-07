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

export async function exportAttendanceSummary(termId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string; row_count: number }>(
    `export-report?report=attendance_summary&term_id=${termId}`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('Export failed');
  return data.url;
}
