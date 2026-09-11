import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';

/**
 * Short Leave doesn't work like the other leave types: it isn't annual and
 * isn't admin-allocated (see backend/supabase/migrations/20260911130000_short_leave_type.sql)
 * — every staff member gets this many free short leaves per calendar month,
 * fixed. Requesting a 3rd in the same month gets converted, with the
 * staff member's confirmation, into a half-day Casual Leave request instead
 * (see MyLeaveScreen's submit()).
 */
export const SHORT_LEAVE_KEY = 'short';
export const SHORT_LEAVE_MONTHLY_CAP = 2;

/**
 * Maternity leave is a 3-phase chain, each phase computed from a single
 * date rather than picked by the staff member (see
 * backend/supabase/migrations/20260911150000_maternity_phases.sql):
 * 'paid' — 84 school days from a chosen start date; 'half_pay' and
 * 'no_pay' — 84 calendar days each, extending the prior phase. Not
 * admin-allocated (see LeaveAllocationScreen) — the day counts are a
 * fixed system rule, the same for everyone.
 */
export const MATERNITY_KEY = 'maternity';
export const MATERNITY_PHASE_DAYS = 84;
export type MaternityPhase = 'paid' | 'half_pay' | 'no_pay';
export const MATERNITY_PHASE_LABEL: Record<MaternityPhase, string> = {
  paid: 'Paid Maternity',
  half_pay: 'Half Pay Leave',
  no_pay: 'No-Pay Leave',
};
export const MATERNITY_PHASE_AFTER: Partial<Record<MaternityPhase, MaternityPhase>> = { paid: 'half_pay', half_pay: 'no_pay' };

export type LeaveType = { id: string; key: string; name: string; requiresDocument: boolean; annualEntitlement: number };

export async function listLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('id, key, name, requires_document, annual_entitlement')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    requiresDocument: r.requires_document,
    annualEntitlement: r.annual_entitlement,
  }));
}

export type LeaveBalance = { leaveTypeId: string; leaveTypeKey: string; leaveTypeName: string; entitled: number; used: number };

/**
 * Leave types that actually carry an entitled/used balance — the same set
 * LeaveAllocationScreen lets the principal allocate, plus short leave
 * (its own fixed monthly cap, computed rather than allocated). Duty,
 * Half Day and Maternity are excluded: duty/half-day because nothing in
 * the app ever sets an entitlement for them, and maternity because its
 * 84/84/84-day phases are a fixed system rule with no entitled/used
 * concept at all (see MATERNITY_PHASE_DAYS).
 */
const BALANCE_TRACKED_KEYS = ['casual', 'medical', SHORT_LEAVE_KEY];

/** The date of the p_schoolDays-th school day counting forward from startIso inclusive — mirrors add_school_days() (20260911150000_maternity_phases.sql), which itself mirrors is_school_day(). Used to compute paid maternity leave's end date server-side, since the span can cross terms/academic years. */
export async function addSchoolDays(startIso: string, schoolDays: number): Promise<string> {
  const { data, error } = await supabase.rpc('add_school_days', { p_start: startIso, p_school_days: schoolDays });
  if (error) throw error;
  return data as string;
}

/** How many of a staff member's leave_requests for one leave type fall within [monthStartIso, monthEndIso] and still count against the month (pending or approved — withdrawn/rejected don't). */
export async function countMonthlyLeaveRequests(
  staffId: string,
  leaveTypeId: string,
  monthStartIso: string,
  monthEndIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .eq('leave_type_id', leaveTypeId)
    .in('status', ['pending', 'approved'])
    .gte('starts_on', monthStartIso)
    .lte('starts_on', monthEndIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Every leave type, for the current academic year — not just the ones that
 * happen to have a leave_balances row. A type the principal hasn't
 * allocated yet (via LeaveAllocationScreen) still shows here, at 0/0,
 * rather than silently disappearing from the staff member's own view.
 *
 * Short Leave is the exception: it has no annual leave_balances row at all
 * (its cap is monthly and fixed, not admin-allocated), so its entitled/used
 * here are computed from this calendar month's requests instead.
 *
 * leave_balances.used only moves when approve_leave() actually decides a
 * request — a freshly submitted, still-pending request leaves it
 * untouched, so a newly submitted casual/medical request wouldn't show up
 * here at all until someone approves it. Pending requests' day_count is
 * added on top here so the balance reflects what's already committed, not
 * just what's been formally approved — matching what short leave already
 * does (it counts pending occurrences too).
 */
export async function fetchMyLeaveBalances(staffId: string): Promise<LeaveBalance[]> {
  const [{ data: yearRow, error: yearError }, allLeaveTypes] = await Promise.all([
    supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle(),
    listLeaveTypes(),
  ]);
  if (yearError) throw yearError;
  const leaveTypes = allLeaveTypes.filter((t) => BALANCE_TRACKED_KEYS.includes(t.key));

  const balanceByType = new Map<string, { entitled: number; used: number }>();
  if (yearRow) {
    const { data: balanceRows, error: balanceError } = await supabase
      .from('leave_balances')
      .select('leave_type_id, entitled, used')
      .eq('staff_id', staffId)
      .eq('academic_year_id', yearRow.id)
      .returns<{ leave_type_id: string; entitled: number; used: number }[]>();
    if (balanceError) throw balanceError;
    for (const r of balanceRows ?? []) balanceByType.set(r.leave_type_id, { entitled: r.entitled, used: r.used });
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from('leave_requests')
    .select('leave_type_id, day_count')
    .eq('staff_id', staffId)
    .eq('status', 'pending')
    .returns<{ leave_type_id: string; day_count: number }[]>();
  if (pendingError) throw pendingError;
  const pendingByType = new Map<string, number>();
  for (const r of pendingRows ?? []) pendingByType.set(r.leave_type_id, (pendingByType.get(r.leave_type_id) ?? 0) + r.day_count);

  const shortLeaveType = leaveTypes.find((t) => t.key === SHORT_LEAVE_KEY);
  const shortLeaveUsed = shortLeaveType
    ? await countMonthlyLeaveRequests(
        staffId,
        shortLeaveType.id,
        format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      )
    : 0;

  return leaveTypes.map((t) => {
    if (t.key === SHORT_LEAVE_KEY) {
      return { leaveTypeId: t.id, leaveTypeKey: t.key, leaveTypeName: t.name, entitled: SHORT_LEAVE_MONTHLY_CAP, used: shortLeaveUsed };
    }
    const balance = balanceByType.get(t.id);
    return {
      leaveTypeId: t.id,
      leaveTypeKey: t.key,
      leaveTypeName: t.name,
      entitled: balance?.entitled ?? 0,
      used: (balance?.used ?? 0) + (pendingByType.get(t.id) ?? 0),
    };
  });
}

export type LeaveRequestRow = {
  id: string;
  staffId: string;
  staffName: string;
  leaveTypeKey: string;
  leaveTypeName: string;
  startsOn: string;
  endsOn: string;
  dayCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  maternityPhase: MaternityPhase | null;
};

const LEAVE_REQUEST_ROW_SELECT =
  'id, staff_id, starts_on, ends_on, day_count, reason, status, created_at, maternity_phase, leave_types(key, name), staff!leave_requests_staff_id_fkey(full_name)';

export async function fetchMyLeaveRequests(staffId: string): Promise<LeaveRequestRow[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(LEAVE_REQUEST_ROW_SELECT)
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })
    .returns<LeaveRequestRpcRow[]>();
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function fetchPendingLeaveRequests(): Promise<LeaveRequestRow[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(LEAVE_REQUEST_ROW_SELECT)
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
  maternity_phase: MaternityPhase | null;
  leave_types: { key: string; name: string } | null;
  staff: { full_name: string } | null;
};

function toRow(r: LeaveRequestRpcRow): LeaveRequestRow {
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff?.full_name ?? '',
    leaveTypeKey: r.leave_types?.key ?? '',
    leaveTypeName: r.leave_types?.name ?? '',
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    dayCount: r.day_count,
    reason: r.reason,
    status: r.status as LeaveRequestRow['status'],
    createdAt: r.created_at,
    maternityPhase: r.maternity_phase,
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
      'id, staff_id, leave_type_id, starts_on, ends_on, half_day, day_count, reason, status, created_at, maternity_phase, leave_types(key, name), staff!leave_requests_staff_id_fkey(full_name)',
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
  staffId: string;
  leaveTypeId: string;
  startsOn: string;
  endsOn: string;
  halfDay: boolean;
  dayCount: number;
  reason: string;
  maternityPhase?: MaternityPhase;
  extendsRequestId?: string;
}): Promise<void> {
  const { error } = await supabase.from('leave_requests').insert({
    staff_id: input.staffId,
    leave_type_id: input.leaveTypeId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    half_day: input.halfDay,
    day_count: input.dayCount,
    reason: input.reason,
    maternity_phase: input.maternityPhase ?? null,
    extends_request_id: input.extendsRequestId ?? null,
  });
  if (error) throw error;
}

export type MaternityChainTip = { requestId: string; phase: MaternityPhase; startsOn: string; endsOn: string };

/**
 * The most recent approved maternity request not yet extended by a later
 * phase — where the next "Extend as ..." action, if any, attaches. Null
 * phase means no maternity chain exists for this staff member at all;
 * phase 'no_pay' means the chain is at its terminal phase (no further
 * extension offered).
 */
export async function fetchMaternityChainTip(staffId: string): Promise<MaternityChainTip | null> {
  const maternityType = (await listLeaveTypes()).find((t) => t.key === MATERNITY_KEY);
  if (!maternityType) return null;

  const { data: extended, error: extendedError } = await supabase
    .from('leave_requests')
    .select('extends_request_id')
    .not('extends_request_id', 'is', null)
    .returns<{ extends_request_id: string }[]>();
  if (extendedError) throw extendedError;
  const extendedIds = (extended ?? []).map((r) => r.extends_request_id);

  let query = supabase
    .from('leave_requests')
    .select('id, maternity_phase, starts_on, ends_on')
    .eq('staff_id', staffId)
    .eq('leave_type_id', maternityType.id)
    .eq('status', 'approved')
    .order('starts_on', { ascending: false })
    .limit(1);
  if (extendedIds.length > 0) query = query.not('id', 'in', `(${extendedIds.join(',')})`);

  const { data, error } = await query.returns<{ id: string; maternity_phase: MaternityPhase | null; starts_on: string; ends_on: string }[]>();
  if (error) throw error;
  const tip = data?.[0];
  if (!tip || !tip.maternity_phase) return null;
  return { requestId: tip.id, phase: tip.maternity_phase, startsOn: tip.starts_on, endsOn: tip.ends_on };
}

/** Submits the next phase after `tip` — dates computed from tip.endsOn, no input from the staff member beyond confirming. Still a normal pending request the principal approves like any other. */
export async function extendMaternityLeave(input: { staffId: string; tip: MaternityChainTip; reason: string }): Promise<void> {
  const nextPhase = MATERNITY_PHASE_AFTER[input.tip.phase];
  if (!nextPhase) throw new Error('This maternity leave has no further phase to extend into.');

  const maternityType = (await listLeaveTypes()).find((t) => t.key === MATERNITY_KEY);
  if (!maternityType) throw new Error('Maternity Leave type not found.');

  const startsOn = format(addDays(parseISO(input.tip.endsOn), 1), 'yyyy-MM-dd');
  const endsOn = format(addDays(parseISO(startsOn), MATERNITY_PHASE_DAYS - 1), 'yyyy-MM-dd');

  await requestLeave({
    staffId: input.staffId,
    leaveTypeId: maternityType.id,
    startsOn,
    endsOn,
    halfDay: false,
    dayCount: MATERNITY_PHASE_DAYS,
    reason: input.reason,
    maternityPhase: nextPhase,
    extendsRequestId: input.tip.requestId,
  });
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

export type LeaveAllocationRow = {
  staffId: string;
  staffName: string;
  leaveTypeId: string;
  entitled: number;
  used: number;
  /** False when there's no leave_balances row at all yet — entitled/used are shown as 0, not any leave-type default. */
  allocated: boolean;
};

/**
 * Every active staff member's balance for a single leave type and academic
 * year, read straight from leave_balances — 0/0 where no row exists yet,
 * never a leave-type default standing in for a real saved value. Powers
 * LeaveAllocationScreen.
 */
export async function fetchLeaveAllocations(leaveTypeId: string, academicYearId: string): Promise<LeaveAllocationRow[]> {
  const [{ data: staffRows, error: staffError }, { data: balanceRows, error: balanceError }] = await Promise.all([
    supabase.from('staff').select('id, full_name').eq('status', 'active').order('full_name'),
    supabase
      .from('leave_balances')
      .select('staff_id, entitled, used')
      .eq('leave_type_id', leaveTypeId)
      .eq('academic_year_id', academicYearId)
      .returns<{ staff_id: string; entitled: number; used: number }[]>(),
  ]);
  if (staffError) throw staffError;
  if (balanceError) throw balanceError;

  const balanceByStaff = new Map((balanceRows ?? []).map((r) => [r.staff_id, r]));

  return (staffRows ?? []).map((s) => {
    const balance = balanceByStaff.get(s.id);
    return {
      staffId: s.id,
      staffName: s.full_name,
      leaveTypeId,
      entitled: balance?.entitled ?? 0,
      used: balance?.used ?? 0,
      allocated: !!balance,
    };
  });
}

export async function setLeaveBalance(input: {
  staffId: string;
  leaveTypeId: string;
  academicYearId: string;
  entitled: number;
}): Promise<void> {
  const { error } = await supabase.rpc('set_leave_balance', {
    p_staff_id: input.staffId,
    p_leave_type_id: input.leaveTypeId,
    p_academic_year_id: input.academicYearId,
    p_entitled: input.entitled,
  });
  if (error) throw error;
}

/** Applies one entitled value to every active staff member's balance for a leave type/year in a single call — "set 7 days for everyone at once." */
export async function setLeaveBalancesForAll(input: {
  leaveTypeId: string;
  academicYearId: string;
  entitled: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc('set_leave_balances_for_all', {
    p_leave_type_id: input.leaveTypeId,
    p_academic_year_id: input.academicYearId,
    p_entitled: input.entitled,
  });
  if (error) throw error;
  return (data as number) ?? 0;
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
