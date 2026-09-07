import { supabase } from '@/lib/supabase';
import { sanitizeFilterValue } from '@/lib/search';

export type StaffSummary = {
  id: string;
  staffNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: 'active' | 'inactive' | 'left';
};

export async function listStaff(query: string): Promise<StaffSummary[]> {
  let request = supabase
    .from('staff')
    .select('id, staff_no, full_name, phone, email, status')
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
    .select('id, staff_no, full_name, phone, email, status')
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw error;
  return data ? toStaffSummary(data) : null;
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

function toStaffSummary(row: {
  id: string;
  staff_no: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
}): StaffSummary {
  return {
    id: row.id,
    staffNo: row.staff_no,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    status: row.status as StaffSummary['status'],
  };
}
