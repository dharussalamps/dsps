import { supabase } from '@/lib/supabase';
import { sanitizeFilterValue } from '@/lib/search';

export type StaffSummary = {
  id: string;
  staffNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string | null;
  joinedOn: string | null;
  status: 'active' | 'inactive' | 'left';
};

export async function listStaff(query: string): Promise<StaffSummary[]> {
  let request = supabase
    .from('staff')
    .select('id, staff_no, full_name, phone, email, address, joined_on, status')
    .order('full_name')
    .limit(50);

  const term = sanitizeFilterValue(query);
  if (term) {
    request = request.or(`full_name.ilike.%${term}%,staff_no.ilike.%${term}%`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []).map(toStaffSummary);
}

export async function getStaffProfile(staffId: string): Promise<StaffSummary | null> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, staff_no, full_name, phone, email, address, joined_on, status')
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw error;
  return data ? toStaffSummary(data) : null;
}

/**
 * Partial update for just the three fields StaffProfileScreen's CONTACT card
 * edits in place. Deliberately narrower than updateStaffAccount (accounts/api.ts),
 * which always rewrites staffNo/fullName/birthDate/joinedOn too — using that here
 * without those values in hand would silently null them out. write_staff RLS
 * (staff.manage/account.manage) still gates who this actually succeeds for.
 */
export async function updateStaffContact(staffId: string, input: { phone: string; email?: string; address?: string }): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .update({ phone: input.phone, email: input.email || null, address: input.address || null })
    .eq('id', staffId);
  if (error) throw error;
}

export async function fetchCurrentAcademicYearId(): Promise<string | null> {
  const { data, error } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export type Responsibility = { id: string; staffId: string; staffName: string; title: string; position: string | null; scheduleNote: string | null };

export async function fetchResponsibilitiesForStaff(staffId: string): Promise<Responsibility[]> {
  const { data, error } = await supabase
    .from('responsibilities')
    .select('id, staff_id, title, position, schedule_note, staff!responsibilities_staff_id_fkey(full_name)')
    .eq('staff_id', staffId)
    .returns<{ id: string; staff_id: string; title: string; position: string | null; schedule_note: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, staffId: r.staff_id, staffName: r.staff?.full_name ?? '', title: r.title, position: r.position, scheduleNote: r.schedule_note }));
}

/** "Same data reachable from person and from duty" — the duty roster view (task 17's completion test). */
export async function fetchDutyRoster(): Promise<Responsibility[]> {
  const { data, error } = await supabase
    .from('responsibilities')
    .select('id, staff_id, title, position, schedule_note, staff!responsibilities_staff_id_fkey(full_name)')
    .order('title')
    .returns<{ id: string; staff_id: string; title: string; position: string | null; schedule_note: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, staffId: r.staff_id, staffName: r.staff?.full_name ?? '', title: r.title, position: r.position, scheduleNote: r.schedule_note }));
}

/** Distinct titles already used elsewhere in the system (e.g. "Library duty" assigned to several staff) — powers the autocomplete on the assign-responsibility form so a title already in use doesn't have to be retyped in full. */
export async function fetchResponsibilityTitleSuggestions(query: string): Promise<string[]> {
  const term = sanitizeFilterValue(query);
  if (!term) return [];
  const { data, error } = await supabase.from('responsibilities').select('title').ilike('title', `%${term}%`).order('title').limit(200);
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (row.title) seen.add(row.title);
  }
  return Array.from(seen).slice(0, 6);
}

export async function assignResponsibility(input: { staffId: string; title: string; position?: string; scheduleNote?: string; academicYearId: string; assignedBy: string }): Promise<void> {
  const { error } = await supabase.from('responsibilities').insert({
    staff_id: input.staffId,
    title: input.title,
    position: input.position || null,
    schedule_note: input.scheduleNote || null,
    academic_year_id: input.academicYearId,
    assigned_by: input.assignedBy,
  });
  if (error) throw error;
}

/** write_responsibilities RLS ('staff.assign_responsibility') covers delete too, so this is a plain client-side removal — audited automatically by the generic row-change trigger. */
export async function removeResponsibility(id: string): Promise<void> {
  const { error } = await supabase.from('responsibilities').delete().eq('id', id);
  if (error) throw error;
}

export type StaffAttendanceMonthSummary = { month: string; presentDays: number; lateDays: number; leaveDays: number; absentDays: number; total: number };

export type StaffAttendanceSummary = {
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  totalDays: number;
  months: StaffAttendanceMonthSummary[];
};

/** FR-STF-05: "a staff profile shows attendance summary." RLS (can_view_staff_attendance) governs who this returns anything for. */
export async function fetchStaffAttendanceSummary(staffId: string, sinceDate: string): Promise<StaffAttendanceSummary> {
  const { data, error } = await supabase
    .from('staff_attendance')
    .select('on_date, status')
    .eq('staff_id', staffId)
    .gte('on_date', sinceDate)
    .order('on_date')
    .returns<{ on_date: string; status: string }[]>();
  if (error) throw error;
  const rows = data ?? [];
  const count = (status: string) => rows.filter((r) => r.status === status).length;

  const byMonth = new Map<string, StaffAttendanceMonthSummary>();
  for (const row of rows) {
    const month = row.on_date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { month, presentDays: 0, lateDays: 0, leaveDays: 0, absentDays: 0, total: 0 };
    bucket.total++;
    if (row.status === 'present') bucket.presentDays++;
    else if (row.status === 'late') bucket.lateDays++;
    else if (row.status === 'on_leave') bucket.leaveDays++;
    else if (row.status === 'absent') bucket.absentDays++;
    byMonth.set(month, bucket);
  }

  return {
    presentDays: count('present'),
    lateDays: count('late'),
    absentDays: count('absent'),
    leaveDays: count('on_leave'),
    totalDays: rows.length,
    months: Array.from(byMonth.values()),
  };
}

/** FR-STF-03: "the directory indicates each colleague's presence for the current day." */
export async function fetchTodayPresence(onDate: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('staff_attendance').select('staff_id, status').eq('on_date', onDate);
  if (error) throw error;
  const result: Record<string, string> = {};
  for (const row of data ?? []) result[row.staff_id] = row.status;
  return result;
}

function toStaffSummary(row: {
  id: string;
  staff_no: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  joined_on: string | null;
  status: string;
}): StaffSummary {
  return {
    id: row.id,
    staffNo: row.staff_no,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    joinedOn: row.joined_on,
    status: row.status as StaffSummary['status'],
  };
}
