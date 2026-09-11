import { useQuery } from '@tanstack/react-query';
import { fetchCalendarDay, fetchCurrentYearTerms, fetchSchoolSettings, fetchWorkingWeekdays, listAcademicYears, listCalendarDaysInRange, listTermsForYear } from './api';

export function useCurrentYearTerms() {
  return useQuery({ queryKey: ['calendar', 'terms'], queryFn: fetchCurrentYearTerms });
}

export function useTermsForYear(academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['calendar', 'terms-for-year', academicYearId],
    queryFn: () => listTermsForYear(academicYearId as string),
    enabled: !!academicYearId,
  });
}

export function useAcademicYears() {
  return useQuery({ queryKey: ['calendar', 'years'], queryFn: listAcademicYears });
}

export function useWorkingWeekdays() {
  return useQuery({ queryKey: ['calendar', 'working-weekdays'], queryFn: fetchWorkingWeekdays });
}

export function useSchoolSettings() {
  return useQuery({ queryKey: ['calendar', 'settings'], queryFn: fetchSchoolSettings });
}

export function useCalendarDay(onDate: string) {
  return useQuery({ queryKey: ['calendar', 'day', onDate], queryFn: () => fetchCalendarDay(onDate) });
}

export function useCalendarDaysInRange(startIso: string | undefined, endIso: string | undefined) {
  return useQuery({
    queryKey: ['calendar', 'days-range', startIso, endIso],
    queryFn: () => listCalendarDaysInRange(startIso as string, endIso as string),
    enabled: !!startIso && !!endIso,
    staleTime: 5 * 60_000,
  });
}
