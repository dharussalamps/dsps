import { useQuery } from '@tanstack/react-query';
import { fetchClassesNeedingCover, fetchIsSchoolDayToday, fetchMyClasses } from './api';

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
