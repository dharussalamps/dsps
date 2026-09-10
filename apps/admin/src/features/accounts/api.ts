import { supabase } from '@/lib/supabase';

export type RoleAssignment = { staffRoleId: string; roleName: string; scopeType: 'school' | 'grade' | 'class' | 'self'; scopeId: string | null };
export type AccountRow = {
  id: string;
  staffNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  /** 'YYYY-MM-DD', or null if never set — powers the Home screen's birthday greeting. */
  birthDate: string | null;
  status: 'active' | 'inactive' | 'left';
  hasLogin: boolean;
  roles: RoleAssignment[];
};

export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('staff')
    .select(
      'id, staff_no, full_name, phone, email, birth_date, status, auth_user_id, staff_roles!staff_roles_staff_id_fkey(id, revoked_at, scope_type, scope_id, roles(name))',
    )
    .order('full_name')
    .returns<
      {
        id: string;
        staff_no: string;
        full_name: string;
        phone: string;
        email: string | null;
        birth_date: string | null;
        status: string;
        auth_user_id: string | null;
        staff_roles: { id: string; revoked_at: string | null; scope_type: string; scope_id: string | null; roles: { name: string } | null }[];
      }[]
    >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    staffNo: r.staff_no,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    birthDate: r.birth_date,
    status: r.status as AccountRow['status'],
    hasLogin: r.auth_user_id != null,
    roles: r.staff_roles
      .filter((sr) => sr.revoked_at == null)
      .map((sr) => ({ staffRoleId: sr.id, roleName: sr.roles?.name ?? '', scopeType: sr.scope_type as RoleAssignment['scopeType'], scopeId: sr.scope_id })),
  }));
}

export async function createStaffAccount(input: { staffNo: string; fullName: string; phone: string; email?: string; birthDate?: string }): Promise<string> {
  const { data, error } = await supabase
    .from('staff')
    .insert({ staff_no: input.staffNo, full_name: input.fullName, phone: input.phone, email: input.email || null, birth_date: input.birthDate || null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateStaffAccount(
  staffId: string,
  input: { staffNo: string; fullName: string; phone: string; email?: string; birthDate?: string },
): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .update({ staff_no: input.staffNo, full_name: input.fullName, phone: input.phone, email: input.email || null, birth_date: input.birthDate || null })
    .eq('id', staffId);
  if (error) throw error;
}

export async function setStaffStatus(staffId: string, status: 'active' | 'inactive'): Promise<void> {
  const { error } = await supabase.from('staff').update({ status }).eq('id', staffId);
  if (error) throw error;
}

/** Extracts the { error: { message } } body the create-staff-login Edge Function returns on failure — supabase-js only surfaces a generic "non-2xx status" message on `error` itself. */
async function edgeFunctionMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error?.message === 'string') return body.error.message;
    } catch {
      // context wasn't JSON — fall through to the generic message.
    }
  }
  return fallback;
}

/**
 * Provisions or reissues a staff member's login via the create-staff-login Edge Function, gated server-side on the same account.manage/staff.manage
 * permission as everything else on this screen. Requires an email already on the staff record. First call for a staff member creates the linked
 * auth.users row; calling it again for someone who already has a login doesn't fail — it generates a *new* temporary password and resets their
 * existing login to it (the original password is never stored anywhere, so there's nothing to literally resend — this issues a fresh one instead,
 * which covers both "they never got the email" and "they're locked out"). The Edge Function also emails it to the staff member directly (via
 * Resend, if configured); `emailSent` tells the caller whether that actually went out, so the UI can fall back to "relay this yourself" when it
 * didn't. Either way, the staff member signs in with the returned password normally and is forced straight to SetPassword.
 */
export async function createStaffLogin(staffId: string): Promise<{ email: string; temporaryPassword: string; emailSent: boolean; created: boolean }> {
  const { data, error } = await supabase.functions.invoke<{
    auth_user_id: string;
    email: string;
    temporary_password: string;
    email_sent: boolean;
    created: boolean;
  }>('create-staff-login', { body: { staff_id: staffId } });
  if (error) throw new Error(await edgeFunctionMessage(error, 'Could not create a login. Please try again.'));
  if (!data) throw new Error('create-staff-login returned no data');
  return { email: data.email, temporaryPassword: data.temporary_password, emailSent: data.email_sent, created: data.created };
}

export type RoleOption = { id: string; key: string; name: string };

export async function listRoles(): Promise<RoleOption[]> {
  const { data, error } = await supabase.from('roles').select('id, key, name').order('name');
  if (error) throw error;
  return data ?? [];
}

/** The signed-in staff member's own active role keys (e.g. 'principal') — read_staff_roles lets every staff row see its own rows regardless of account.manage. */
export async function listMyRoleKeys(staffId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('staff_roles')
    .select('roles(key)')
    .eq('staff_id', staffId)
    .is('revoked_at', null)
    .returns<{ roles: { key: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => r.roles?.key).filter((key): key is string => !!key);
}

export async function assignRole(input: { staffId: string; roleId: string; scopeType: 'school' | 'grade' | 'class' | 'self'; scopeId: string | null; grantedBy: string }): Promise<void> {
  const { error } = await supabase.from('staff_roles').insert({
    staff_id: input.staffId,
    role_id: input.roleId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    granted_by: input.grantedBy,
  });
  if (error) throw error;
}

export async function revokeRole(staffRoleId: string): Promise<void> {
  const { error } = await supabase.from('staff_roles').update({ revoked_at: new Date().toISOString() }).eq('id', staffRoleId);
  if (error) throw error;
}

export type AuditEntry = { id: number; actorName: string | null; action: string; entity: string; entityId: string | null; createdAt: string; reason: string | null };

/** FR-ADM-05: "the principal may search the audit log by actor, entity, or date range." All filters optional and combine with AND. */
export async function listAuditLog(filters: { actorId?: string; entity?: string; fromDate?: string; toDate?: string } = {}): Promise<AuditEntry[]> {
  let request = supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, created_at, reason, staff(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filters.actorId) request = request.eq('actor_id', filters.actorId);
  if (filters.entity) request = request.eq('entity', filters.entity);
  if (filters.fromDate) request = request.gte('created_at', filters.fromDate);
  if (filters.toDate) request = request.lte('created_at', filters.toDate);

  const { data, error } = await request.returns<{ id: number; action: string; entity: string; entity_id: string | null; created_at: string; reason: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, actorName: r.staff?.full_name ?? null, action: r.action, entity: r.entity, entityId: r.entity_id, createdAt: r.created_at, reason: r.reason }));
}

/** Entity names actually present in the log, for a filter picker — cheaper than a hardcoded list that drifts from what audit_row_change() actually writes. */
export async function listAuditEntities(): Promise<string[]> {
  const { data, error } = await supabase.from('audit_log').select('entity').limit(1000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.entity))).sort();
}
