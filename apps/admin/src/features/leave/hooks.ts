import { useQuery } from '@tanstack/react-query';
import {
  fetchLeaveRequestDetail,
  fetchMyLeaveBalances,
  fetchMyLeaveRequests,
  fetchPendingLeaveRequests,
  listLeaveTypes,
} from './api';

export function useLeaveTypes() {
  return useQuery({ queryKey: ['leave', 'types'], queryFn: listLeaveTypes, staleTime: 5 * 60_000 });
}

export function useMyLeaveBalances(staffId: string | undefined) {
  return useQuery({
    queryKey: ['leave', 'balances', staffId],
    queryFn: () => fetchMyLeaveBalances(staffId as string),
    enabled: !!staffId,
  });
}

export function useMyLeaveRequests(staffId: string | undefined) {
  return useQuery({
    queryKey: ['leave', 'my-requests', staffId],
    queryFn: () => fetchMyLeaveRequests(staffId as string),
    enabled: !!staffId,
  });
}

export function usePendingLeaveRequests() {
  return useQuery({ queryKey: ['leave', 'pending'], queryFn: fetchPendingLeaveRequests });
}

export function useLeaveRequestDetail(id: string) {
  return useQuery({ queryKey: ['leave', 'detail', id], queryFn: () => fetchLeaveRequestDetail(id) });
}
