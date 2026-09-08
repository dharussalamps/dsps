import { useQuery } from '@tanstack/react-query';
import { fetchCalendarDay, fetchCurrentYearTerms, fetchSchoolSettings, fetchWorkingWeekdays, listAcademicYears } from './api';

export function useCurrentYearTerms() {
  return useQuery({ queryKey: ['calendar', 'terms'], queryFn: fetchCurrentYearTerms });
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
