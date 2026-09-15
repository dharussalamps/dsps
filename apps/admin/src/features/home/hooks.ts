import { useQuery } from '@tanstack/react-query';
import { fetchAnnouncements } from '@/features/announcements/api';
import { listAuditLog } from '@/features/accounts/api';
import { fetchMyNotifications } from '@/features/notifications/api';
import {
  fetchAcademicPerformanceSummary,
  fetchCalendarOverview,
  fetchClassAttendanceTrend,
  fetchClassesNeedingCover,
  fetchEarlyLeavesToday,
  fetchEnrollmentSnapshot,
  fetchIsSchoolDayToday,
  fetchMyClasses,
  fetchNewThisTerm,
  fetchStaffOnLeaveToday,
  fetchStudentAttendanceToday,
  fetchThisWeeksEvents,
  fetchTodaysBirthdays,
  fetchUpcomingCoverAssignments,
} from './api';

export function useClassesNeedingCover(onDate: string) {
  return useQuery({ queryKey: ['home', 'needs-cover', onDate], queryFn: () => fetchClassesNeedingCover(onDate) });
}

export function useMyClasses(staffId: string | undefined) {
  return useQuery({
    queryKey: ['home', 'my-classes', staffId],
    queryFn: () => fetchMyClasses(staffId as string),
    enabled: !!staffId,
  });
}

export function useIsSchoolDayToday() {
  return useQuery({ queryKey: ['home', 'is-school-day-today'], queryFn: fetchIsSchoolDayToday, staleTime: 5 * 60_000 });
}

export function useTodaysBirthdays(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'birthdays'], queryFn: fetchTodaysBirthdays, enabled });
}

export function useAcademicPerformanceSummary(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'academic-performance'], queryFn: fetchAcademicPerformanceSummary, enabled });
}

export function useStaffOnLeaveToday(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'staff-on-leave'], queryFn: fetchStaffOnLeaveToday, enabled });
}

export function useClassAttendanceTrend(classId: string, enabled: boolean) {
  return useQuery({ queryKey: ['home', 'attendance-trend', classId], queryFn: () => fetchClassAttendanceTrend(classId), enabled });
}

/** refetchInterval matches useMarkingStatus (attendance/hooks.ts) — Home never unmounts between marking a class and returning to it, so without a poll this would keep showing whatever it read on first load. */
export function useStudentAttendanceToday(onDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'student-attendance-today', onDate],
    queryFn: () => fetchStudentAttendanceToday(onDate),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useRecentAnnouncements(staffId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'recent-announcements', staffId],
    queryFn: () => fetchAnnouncements(staffId as string),
    enabled: enabled && !!staffId,
  });
}

export function useRecentNotifications(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'recent-notifications'], queryFn: fetchMyNotifications, enabled });
}

export function useThisWeeksEvents(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'week-events'], queryFn: fetchThisWeeksEvents, enabled });
}

export function useEarlyLeavesToday(onDate: string, enabled: boolean) {
  return useQuery({ queryKey: ['home', 'early-leaves-today', onDate], queryFn: () => fetchEarlyLeavesToday(onDate), enabled });
}

export function useUpcomingCoverAssignments(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'upcoming-cover'], queryFn: fetchUpcomingCoverAssignments, enabled });
}

export function useEnrollmentSnapshot(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'enrollment-snapshot'], queryFn: fetchEnrollmentSnapshot, enabled });
}

export function useCalendarOverview(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'calendar-overview'], queryFn: fetchCalendarOverview, enabled });
}

export function useRecentAuditActivity(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'recent-audit'], queryFn: () => listAuditLog(), enabled });
}

export function useNewThisTerm(enabled: boolean) {
  return useQuery({ queryKey: ['home', 'new-this-term'], queryFn: fetchNewThisTerm, enabled });
}
