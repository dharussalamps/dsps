import { useQuery } from '@tanstack/react-query';
import { fetchDutyRoster, fetchResponsibilitiesForStaff, fetchStaffAttendanceSummary, fetchTodayPresence, getStaffProfile, listStaff } from './api';

export function useStaffAttendanceSummary(staffId: string | undefined, sinceDate: string) {
  return useQuery({
    queryKey: ['staff', 'attendance-summary', staffId, sinceDate],
    queryFn: () => fetchStaffAttendanceSummary(staffId as string, sinceDate),
    enabled: !!staffId,
  });
}

export function useTodayPresence(onDate: string) {
  return useQuery({ queryKey: ['staff', 'today-presence', onDate], queryFn: () => fetchTodayPresence(onDate) });
}

export function useStaffDirectory(query: string) {
  return useQuery({ queryKey: ['staff', 'list', query.trim()], queryFn: () => listStaff(query) });
}

export function useStaffProfile(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff', 'profile', staffId],
    queryFn: () => getStaffProfile(staffId as string),
    enabled: !!staffId,
  });
}

export function useResponsibilitiesForStaff(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff', 'responsibilities', staffId],
    queryFn: () => fetchResponsibilitiesForStaff(staffId as string),
    enabled: !!staffId,
  });
}

export function useDutyRoster() {
  return useQuery({ queryKey: ['staff', 'duty-roster'], queryFn: fetchDutyRoster });
}
