import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { listAccounts, listAuditEntities, listAuditLog, listMyRoleKeys, listRoles } from './api';

export function useAccounts() {
  return useQuery({ queryKey: ['accounts', 'list'], queryFn: listAccounts });
}

export function useRoles() {
  return useQuery({ queryKey: ['accounts', 'roles'], queryFn: listRoles, staleTime: 60 * 60_000 });
}

export function useMyRoleKeys() {
  const staffId = useAuthStore((s) => s.staff?.id);
  return useQuery({
    queryKey: ['accounts', 'my-roles', staffId],
    queryFn: () => listMyRoleKeys(staffId as string),
    enabled: !!staffId,
    staleTime: 5 * 60_000,
  });
}

/** Gates the principal-only bottom-nav swap (Announcements -> Staff) — see TabsNavigator. */
export function useIsPrincipal(): boolean {
  const { data } = useMyRoleKeys();
  return data?.includes('principal') ?? false;
}

/** Mirrors import_students()'s role check (AdminSpec.md section 5.2) — creating/importing
 * students is narrower than `student.edit`: principal and administrator only, not vice_principal. */
export function useCanCreateStudents(): boolean {
  const { data } = useMyRoleKeys();
  return data?.some((key) => key === 'principal' || key === 'administrator') ?? false;
}

export type AuditFilters = { actorId?: string; entity?: string; fromDate?: string; toDate?: string };

export function useAuditLog(filters: AuditFilters = {}) {
  return useQuery({ queryKey: ['accounts', 'audit-log', filters], queryFn: () => listAuditLog(filters) });
}

export function useAuditEntities() {
  return useQuery({ queryKey: ['accounts', 'audit-entities'], queryFn: listAuditEntities, staleTime: 5 * 60_000 });
}
