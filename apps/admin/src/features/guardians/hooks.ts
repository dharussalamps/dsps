import { useQuery } from '@tanstack/react-query';
import { findGuardianByNic } from './api';

export function useGuardianByNic(nic: string) {
  const term = nic.trim();
  return useQuery({
    queryKey: ['guardians', 'byNic', term],
    queryFn: () => findGuardianByNic(term),
    enabled: term.length >= 5,
  });
}
