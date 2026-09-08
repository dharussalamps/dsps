import { supabase } from '@/lib/supabase';

export type RoleAssignment = { staffRoleId: string; roleName: string; scopeType: 'school' | 'grade' | 'class' | 'self'; scopeId: string | null };
export type AccountRow = { id: string; staffNo: string; fullName: string; status: 'active' | 'inactive' | 'left'; hasLogin: boolean; roles: RoleAssignment[] };

export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, staff_no, full_name, status, auth_user_id, staff_roles(id, revoked_at, scope_type, scope_id, roles(name))')
    .order('full_name')
    .returns<
      {
        id: string;
        staff_no: string;
        full_name: string;
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
    status: r.status as AccountRow['status'],
    hasLogin: r.auth_user_id != null,
    roles: r.staff_roles
      .filter((sr) => sr.revoked_at == null)
      .map((sr) => ({ staffRoleId: sr.id, roleName: sr.roles?.name ?? '', scopeType: sr.scope_type as RoleAssignment['scopeType'], scopeId: sr.scope_id })),
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
