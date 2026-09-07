import { useQuery } from '@tanstack/react-query';
import { fetchCalendarDay, fetchCurrentYearTerms, fetchSchoolSettings } from './api';

export function useCurrentYearTerms() {
  return useQuery({ queryKey: ['calendar', 'terms'], queryFn: fetchCurrentYearTerms });
}

export function useSchoolSettings() {
  return useQuery({ queryKey: ['calendar', 'settings'], queryFn: fetchSchoolSettings });
}

export function useCalendarDay(onDate: string) {
  return useQuery({ queryKey: ['calendar', 'day', onDate], queryFn: () => fetchCalendarDay(onDate) });
}
