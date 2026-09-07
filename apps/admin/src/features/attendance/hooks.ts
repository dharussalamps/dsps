import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchExistingSubmission, fetchMarkingStatus, fetchStaffAttendanceToday } from './api';

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function useMarkingStatus(onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'marking-status', onDate],
    queryFn: () => fetchMarkingStatus(onDate),
    refetchInterval: 60_000,
  });
}

export function useExistingSubmission(classId: string, onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'submission', classId, onDate],
    queryFn: () => fetchExistingSubmission(classId, onDate),
  });
}

export function useStaffAttendanceToday(onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'staff-board', onDate],
    queryFn: () => fetchStaffAttendanceToday(onDate),
  });
}
