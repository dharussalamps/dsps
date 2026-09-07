import { useQuery } from '@tanstack/react-query';
import { getEvent, listDiaryEntries, listEventsInMonth } from './api';

export function useEventsInMonth(year: number, month: number) {
  return useQuery({ queryKey: ['events', 'month', year, month], queryFn: () => listEventsInMonth(year, month) });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId as string),
    enabled: !!eventId,
  });
}

export function useDiaryEntries(year: number) {
  return useQuery({ queryKey: ['diary', year], queryFn: () => listDiaryEntries(year) });
}
