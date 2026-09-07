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
