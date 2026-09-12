import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCoverAssignmentsByYear,
  fetchLeaveAllocations,
  fetchLeaveRequestDetail,
  fetchLeaveRequestsByStatus,
  fetchLeaveTypeBalance,
  fetchMaternityChainTip,
  fetchMyLeaveBalances,
  fetchMyLeaveRequests,
  fetchPendingLeaveRequests,
  listLeaveTypes,
  removeCoverAssignment,
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

/** Backs LeaveRequestsScreen's Pending/Approved tabs, scoped to one academic year's date range (or unscoped when yearRange is omitted). */
export function useLeaveRequestsByStatus(status: 'pending' | 'approved', yearRange?: { startsOn: string; endsOn: string }) {
  return useQuery({
    queryKey: ['leave', 'by-status', status, yearRange?.startsOn, yearRange?.endsOn],
    queryFn: () => fetchLeaveRequestsByStatus(status, yearRange?.startsOn, yearRange?.endsOn),
  });
}

export function useLeaveRequestDetail(id: string) {
  return useQuery({ queryKey: ['leave', 'detail', id], queryFn: () => fetchLeaveRequestDetail(id) });
}

/** Live balance preview for the approval screen's leave-type reassignment picker — fetched fresh whenever the principal picks a different candidate type, so they see that type's actual remaining balance before assigning into it. */
export function useLeaveTypeBalance(staffId: string | undefined, leaveTypeId: string | undefined) {
  return useQuery({
    queryKey: ['leave', 'type-balance', staffId, leaveTypeId],
    queryFn: () => fetchLeaveTypeBalance(staffId as string, leaveTypeId as string),
    enabled: !!staffId && !!leaveTypeId,
  });
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

export function useMaternityChainTip(staffId: string | undefined) {
  return useQuery({
    queryKey: ['leave', 'maternity-tip', staffId],
    queryFn: () => fetchMaternityChainTip(staffId as string),
    enabled: !!staffId,
  });
}

/** Backs AssignCoverScreen's "Assigned" tab, one academic year at a time (or every assignment ever made when yearRange is omitted) — same year-scoping shape as useLeaveRequestsByStatus. */
export function useCoverAssignments(yearRange?: { startsOn: string; endsOn: string }) {
  return useQuery({
    queryKey: ['leave', 'cover-assignments', yearRange?.startsOn, yearRange?.endsOn],
    queryFn: () => fetchCoverAssignmentsByYear(yearRange?.startsOn, yearRange?.endsOn),
  });
}

export function useRemoveCoverAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeCoverAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave', 'cover-assignments'] }),
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
