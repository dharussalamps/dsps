import { useQuery } from '@tanstack/react-query';
import { listAccounts, listAuditEntities, listAuditLog, listRoles } from './api';

export function useAccounts() {
  return useQuery({ queryKey: ['accounts', 'list'], queryFn: listAccounts });
}

export function useRoles() {
  return useQuery({ queryKey: ['accounts', 'roles'], queryFn: listRoles, staleTime: 60 * 60_000 });
}

export type AuditFilters = { actorId?: string; entity?: string; fromDate?: string; toDate?: string };

export function useAuditLog(filters: AuditFilters = {}) {
  return useQuery({ queryKey: ['accounts', 'audit-log', filters], queryFn: () => listAuditLog(filters) });
}

export function useAuditEntities() {
  return useQuery({ queryKey: ['accounts', 'audit-entities'], queryFn: listAuditEntities, staleTime: 5 * 60_000 });
}
