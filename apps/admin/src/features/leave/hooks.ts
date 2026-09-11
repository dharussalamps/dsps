import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchLeaveAllocations,
  fetchLeaveRequestDetail,
  fetchMyLeaveBalances,
  fetchMyLeaveRequests,
  fetchPendingLeaveRequests,
  listLeaveTypes,
  setLeaveBalance,
  setLeaveBalancesForAll,
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

export function useLeaveAllocations(leaveTypeId: string | undefined, academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['leave', 'allocations', leaveTypeId, academicYearId],
    queryFn: () => fetchLeaveAllocations(leaveTypeId as string, academicYearId as string),
    enabled: !!leaveTypeId && !!academicYearId,
  });
}

export function useSetLeaveBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setLeaveBalance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', 'allocations'] });
      void queryClient.invalidateQueries({ queryKey: ['leave', 'balances'] });
    },
  });
}

export function useSetLeaveBalancesForAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setLeaveBalancesForAll,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', 'allocations'] });
      void queryClient.invalidateQueries({ queryKey: ['leave', 'balances'] });
    },
  });
}
