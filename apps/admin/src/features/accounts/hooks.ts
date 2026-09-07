import { useQuery } from '@tanstack/react-query';
import { listAccounts, listAuditLog, listRoles } from './api';

export function useAccounts() {
  return useQuery({ queryKey: ['accounts', 'list'], queryFn: listAccounts });
}

export function useRoles() {
  return useQuery({ queryKey: ['accounts', 'roles'], queryFn: listRoles, staleTime: 60 * 60_000 });
}

export function useAuditLog() {
  return useQuery({ queryKey: ['accounts', 'audit-log'], queryFn: listAuditLog });
}
