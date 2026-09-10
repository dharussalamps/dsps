import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  fetchAttendanceEditable,
  fetchClassAttendanceReopen,
  fetchClassName,
  fetchExistingSubmission,
  fetchIsSchoolDay,
  fetchMarkingStatus,
  fetchStaffAttendanceReopen,
  fetchStaffAttendanceSubmitted,
  fetchStaffAttendanceToday,
  fetchStudentAttendanceForDate,
  fetchStudentAttendanceSummary,
} from './api';

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function useClassName(classId: string) {
  return useQuery({
    queryKey: ['attendance', 'class-name', classId],
    queryFn: () => fetchClassName(classId),
    staleTime: 5 * 60_000,
  });
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

export function useAttendanceEditable(classId: string, onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'editable', classId, onDate],
    queryFn: () => fetchAttendanceEditable(classId, onDate),
  });
}

export function useStudentAttendanceForDate(classId: string, onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'existing-for-date', classId, onDate],
    queryFn: () => fetchStudentAttendanceForDate(classId, onDate),
  });
}

/** Meaningful for any locked class/date — a past date, or today once its edit window has closed. */
export function useClassAttendanceReopen(classId: string, onDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', 'class-reopen', classId, onDate],
    queryFn: () => fetchClassAttendanceReopen(classId, onDate),
    enabled,
  });
}

export function useStaffAttendanceToday(onDate: string) {
  return useQuery({
    queryKey: ['attendance', 'staff-board', onDate],
    queryFn: () => fetchStaffAttendanceToday(onDate),
  });
}

export function useIsSchoolDay(onDate: string) {
  return useQuery({ queryKey: ['attendance', 'is-school-day', onDate], queryFn: () => fetchIsSchoolDay(onDate), staleTime: 5 * 60_000 });
}

/** Meaningful for any locked date — a past date, or today once it's been submitted. */
export function useStaffAttendanceReopen(onDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', 'staff-reopen', onDate],
    queryFn: () => fetchStaffAttendanceReopen(onDate),
    enabled,
  });
}

/** Whether today's board has already been bulk-submitted — irrelevant for a past date, which is always locked regardless. */
export function useStaffAttendanceSubmitted(onDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', 'staff-submitted', onDate],
    queryFn: () => fetchStaffAttendanceSubmitted(onDate),
    enabled,
  });
}

export function useStudentAttendanceSummary(studentId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', 'student-summary', studentId],
    queryFn: () => fetchStudentAttendanceSummary(studentId as string),
    enabled: !!studentId,
  });
}
