import { supabase } from '@/lib/supabase';

export async function recordEarlyLeave(input: {
  studentId: string;
  onDate: string;
  leftAt: string; // HH:MM
  reason?: string;
  collectedBy?: string;
}): Promise<void> {
  const { error } = await supabase.from('early_leaves').insert({
    student_id: input.studentId,
    on_date: input.onDate,
    left_at: input.leftAt,
    reason: input.reason || null,
    collected_by: input.collectedBy || null,
  });
  if (error) throw error;
}

export type EarlyLeaveRecord = {
  id: string;
  studentId: string;
  studentName: string;
  leftAt: string;
  reason: string | null;
  collectedBy: string | null;
};

/** studentIds scopes this to one class's roster — avoids a doubly-nested PostgREST filter through students -> student_enrolments. */
export async function listEarlyLeavesToday(studentIds: string[], onDate: string): Promise<EarlyLeaveRecord[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('early_leaves')
    .select('id, student_id, left_at, reason, collected_by, students(full_name)')
    .eq('on_date', onDate)
    .in('student_id', studentIds)
    .returns<
      { id: string; student_id: string; left_at: string; reason: string | null; collected_by: string | null; students: { full_name: string } | null }[]
    >();

  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.students?.full_name ?? '',
    leftAt: r.left_at,
    reason: r.reason,
    collectedBy: r.collected_by,
  }));
}
