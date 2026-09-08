import { supabase } from '@/lib/supabase';

export type LeaveType = { id: string; key: string; name: string; requiresDocument: boolean };

export async function listLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await supabase.from('leave_types').select('id, key, name, requires_document').order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, requiresDocument: r.requires_document }));
}

export type LeaveBalance = { leaveTypeId: string; leaveTypeName: string; entitled: number; used: number };

export async function fetchMyLeaveBalances(staffId: string): Promise<LeaveBalance[]> {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('leave_type_id, entitled, used, leave_types(name)')
    .eq('staff_id', staffId)
    .returns<{ leave_type_id: string; entitled: number; used: number; leave_types: { name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    leaveTypeId: r.leave_type_id,
    leaveTypeName: r.leave_types?.name ?? '',
    entitled: r.entitled,
    used: r.used,
  }));
}

export type LeaveRequestRow = {
  id: string;
  staffId: string;
  staffName: string;
  leaveTypeName: string;
  startsOn: string;
  endsOn: string;
  dayCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
};

export async function fetchMyLeaveRequests(staffId: string): Promise<LeaveRequestRow[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, staff_id, starts_on, ends_on, day_count, reason, status, created_at, leave_types(name), staff!leave_requests_staff_id_fkey(full_name)')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })
    .returns<LeaveRequestRpcRow[]>();
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function fetchPendingLeaveRequests(): Promise<LeaveRequestRow[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, staff_id, starts_on, ends_on, day_count, reason, status, created_at, leave_types(name), staff!leave_requests_staff_id_fkey(full_name)')
    .eq('status', 'pending')
    .order('created_at')
    .returns<LeaveRequestRpcRow[]>();
  if (error) throw error;
  return (data ?? []).map(toRow);
}

type LeaveRequestRpcRow = {
  id: string;
  staff_id: string;
  starts_on: string;
  ends_on: string;
  day_count: number;
  reason: string;
  status: string;
  created_at: string;
  leave_types: { name: string } | null;
  staff: { full_name: string } | null;
};

function toRow(r: LeaveRequestRpcRow): LeaveRequestRow {
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff?.full_name ?? '',
    leaveTypeName: r.leave_types?.name ?? '',
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    dayCount: r.day_count,
    reason: r.reason,
    status: r.status as LeaveRequestRow['status'],
    createdAt: r.created_at,
  };
}

export type LeaveRequestDetail = LeaveRequestRow & {
  leaveTypeId: string;
  halfDay: boolean;
  requiresCover: boolean;
  suggestedCover: { staffId: string; fullName: string }[];
  balance: { entitled: number; used: number } | null;
  otherStaffOnLeave: number;
};

export async function fetchLeaveRequestDetail(id: string): Promise<LeaveRequestDetail | null> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(
      'id, staff_id, leave_type_id, starts_on, ends_on, half_day, day_count, reason, status, created_at, leave_types(name), staff!leave_requests_staff_id_fkey(full_name)',
    )
    .eq('id', id)
    .maybeSingle()
    .returns<(LeaveRequestRpcRow & { leave_type_id: string; half_day: boolean }) | null>();
  if (error) throw error;
  if (!data) return null;

  const { data: myClass } = await supabase.from('classes').select('id').eq('class_teacher_id', data.staff_id).maybeSingle();

  let suggestedCover: { staffId: string; fullName: string }[] = [];
  if (myClass) {
    const { data: candidates } = await supabase.from('staff').select('id, full_name').eq('status', 'active').neq('id', data.staff_id).limit(20);
    suggestedCover = (candidates ?? []).map((c) => ({ staffId: c.id, fullName: c.full_name }));
  }

  // FR-LVE-04: shown to the approver before they can approve — remaining
  // balance for this leave type, and how many other staff already have
  // approved leave overlapping the same dates.
  const [{ data: balanceRow }, { data: otherCount, error: otherCountError }] = await Promise.all([
    supabase
      .from('leave_balances')
      .select('entitled, used')
      .eq('staff_id', data.staff_id)
      .eq('leave_type_id', data.leave_type_id)
      .maybeSingle(),
    supabase.rpc('count_staff_on_leave', { p_starts: data.starts_on, p_ends: data.ends_on, p_exclude_staff: data.staff_id }),
  ]);
  if (otherCountError) throw otherCountError;

  return {
    ...toRow(data),
    leaveTypeId: data.leave_type_id,
    halfDay: data.half_day,
    requiresCover: !!myClass,
    suggestedCover,
    balance: balanceRow ? { entitled: balanceRow.entitled, used: balanceRow.used } : null,
    otherStaffOnLeave: (otherCount as number) ?? 0,
  };
}

export async function requestLeave(input: {
  leaveTypeId: string;
  startsOn: string;
  endsOn: string;
  halfDay: boolean;
  dayCount: number;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.from('leave_requests').insert({
    leave_type_id: input.leaveTypeId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    half_day: input.halfDay,
    day_count: input.dayCount,
    reason: input.reason,
  });
  if (error) throw error;
}

export async function withdrawLeave(id: string): Promise<void> {
  const { error } = await supabase.from('leave_requests').update({ status: 'withdrawn' }).eq('id', id);
  if (error) throw error;
}

export async function approveLeave(
  id: string,
  coverStaffId: string | null,
  coverNotNeeded: boolean,
  remarks?: string,
): Promise<void> {
  const { error } = await supabase.rpc('approve_leave', {
    p_request_id: id,
    p_cover_staff_id: coverStaffId,
    p_cover_not_needed: coverNotNeeded,
    p_remarks: remarks || null,
  });
  if (error) throw error;
}

export async function rejectLeave(id: string, remarks: string): Promise<void> {
  const { error } = await supabase.rpc('reject_leave', { p_request_id: id, p_remarks: remarks });
  if (error) throw error;
}

/**
 * FR-COV-01: "a principal or sectional head may assign a cover teacher to a
 * class for a stated date range" — standalone, not only as a side effect of
 * approving leave. assign_cover() (backend/supabase/migrations/
 * 20260907120005_assign_cover.sql) already existed with no client caller.
 */
export async function assignCover(input: { classId: string; staffId: string; startsOn: string; endsOn: string; reason?: string }): Promise<void> {
  const { error } = await supabase.rpc('assign_cover', {
    p_class_id: input.classId,
    p_staff_id: input.staffId,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_reason: input.reason || null,
  });
  if (error) throw error;
}
