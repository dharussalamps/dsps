import { useQuery } from '@tanstack/react-query';
import { fetchCurrentTermId, fetchGradeNames, fetchSummaries } from './api';

export function useCurrentTermId() {
  return useQuery({ queryKey: ['analytics', 'current-term'], queryFn: fetchCurrentTermId });
}

export function useSummaries(termId: string | undefined, scopeType: 'school' | 'grade' | 'class') {
  return useQuery({
    queryKey: ['analytics', 'summaries', termId, scopeType],
    queryFn: () => fetchSummaries(termId as string, scopeType),
    enabled: !!termId,
  });
}

export function useGradeNames() {
  return useQuery({ queryKey: ['analytics', 'grade-names'], queryFn: fetchGradeNames, staleTime: 60 * 60_000 });
}
