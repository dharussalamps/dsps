import { supabase } from '@/lib/supabase';

export type AccountRow = { id: string; staffNo: string; fullName: string; status: 'active' | 'inactive' | 'left'; hasLogin: boolean; roles: string[] };

export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, staff_no, full_name, status, auth_user_id, staff_roles(role_id, revoked_at, roles(name))')
    .order('full_name')
    .returns<
      { id: string; staff_no: string; full_name: string; status: string; auth_user_id: string | null; staff_roles: { role_id: string; revoked_at: string | null; roles: { name: string } | null }[] }[]
    >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    staffNo: r.staff_no,
    fullName: r.full_name,
    status: r.status as AccountRow['status'],
    hasLogin: r.auth_user_id != null,
    roles: r.staff_roles.filter((sr) => sr.revoked_at == null).map((sr) => sr.roles?.name ?? '').filter(Boolean),
  }));
}

export async function createStaffAccount(input: { staffNo: string; fullName: string; phone: string; email?: string }): Promise<string> {
  const { data, error } = await supabase
    .from('staff')
    .insert({ staff_no: input.staffNo, full_name: input.fullName, phone: input.phone, email: input.email || null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function setStaffStatus(staffId: string, status: 'active' | 'inactive'): Promise<void> {
  const { error } = await supabase.from('staff').update({ status }).eq('id', staffId);
  if (error) throw error;
}

export type RoleOption = { id: string; key: string; name: string };

export async function listRoles(): Promise<RoleOption[]> {
  const { data, error } = await supabase.from('roles').select('id, key, name').order('name');
  if (error) throw error;
  return data ?? [];
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

export async function listAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, created_at, reason, staff(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<{ id: number; action: string; entity: string; entity_id: string | null; created_at: string; reason: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, actorName: r.staff?.full_name ?? null, action: r.action, entity: r.entity, entityId: r.entity_id, createdAt: r.created_at, reason: r.reason }));
}
