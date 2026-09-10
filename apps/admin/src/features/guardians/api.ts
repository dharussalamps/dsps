import { supabase } from '@/lib/supabase';

export type GuardianRecord = {
  id: string;
  fullName: string;
  relationship: string | null;
  phonePrimary: string;
  phoneAlt: string | null;
  nicNumber: string | null;
  email: string | null;
  occupation: string | null;
  economicStatus: string | null;
  address: string | null;
  gsDivision: string | null;
};

/**
 * Look up a guardian by exact NIC number. Used when adding a guardian to a
 * student so an already-recorded parent (of a sibling, say) gets linked
 * rather than duplicated — a guardian is one record shared across every
 * child of theirs, never a per-student copy.
 */
export async function findGuardianByNic(nic: string): Promise<GuardianRecord | null> {
  const term = nic.trim().replace(/[%_]/g, '');
  if (!term) return null;

  const { data, error } = await supabase
    .from('guardians')
    .select('id, full_name, relationship, phone_primary, phone_alt, nic_number, email, occupation, economic_status, address, gs_division')
    .ilike('nic_number', term)
    .neq('status', 'left')
    .limit(1)
    .maybeSingle<{
      id: string;
      full_name: string;
      relationship: string | null;
      phone_primary: string;
      phone_alt: string | null;
      nic_number: string | null;
      email: string | null;
      occupation: string | null;
      economic_status: string | null;
      address: string | null;
      gs_division: string | null;
    }>();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    relationship: data.relationship,
    phonePrimary: data.phone_primary,
    phoneAlt: data.phone_alt,
    nicNumber: data.nic_number,
    email: data.email,
    occupation: data.occupation,
    economicStatus: data.economic_status,
    address: data.address,
    gsDivision: data.gs_division,
  };
}

export type NewGuardianInput = {
  fullName: string;
  relationship?: string;
  phonePrimary: string;
  phoneAlt?: string;
  nicNumber?: string;
  email?: string;
  occupation?: string;
  economicStatus?: string;
  address?: string;
  gsDivision?: string;
};

/** Creates a brand-new guardian record — only once a search has turned up no existing match. */
export async function createGuardian(input: NewGuardianInput): Promise<string> {
  const { data, error } = await supabase
    .from('guardians')
    .insert({
      full_name: input.fullName.trim(),
      relationship: input.relationship?.trim() || null,
      phone_primary: input.phonePrimary.trim(),
      phone_alt: input.phoneAlt?.trim() || null,
      nic_number: input.nicNumber?.trim() || null,
      email: input.email?.trim() || null,
      occupation: input.occupation?.trim() || null,
      economic_status: input.economicStatus?.trim() || null,
      address: input.address?.trim() || null,
      gs_division: input.gsDivision?.trim() || null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Links an existing guardian to a student. A student has at most one primary
 * guardian (one_primary_guardian, a partial unique index) — demoting
 * whichever guardian currently holds it before this link claims it avoids
 * tripping that constraint.
 */
export async function linkGuardianToStudent(studentId: string, guardianId: string, isPrimary: boolean): Promise<void> {
  if (isPrimary) {
    const { error: demoteError } = await supabase
      .from('student_guardians')
      .update({ is_primary: false })
      .eq('student_id', studentId)
      .eq('is_primary', true);
    if (demoteError) throw demoteError;
  }

  const { error } = await supabase
    .from('student_guardians')
    .upsert({ student_id: studentId, guardian_id: guardianId, is_primary: isPrimary }, { onConflict: 'student_id,guardian_id' });
  if (error) throw error;
}
