import { useQuery } from '@tanstack/react-query';
import { fetchAnnouncements } from './api';

export function useAnnouncements(staffId: string | undefined) {
  return useQuery({
    queryKey: ['announcements', staffId],
    queryFn: () => fetchAnnouncements(staffId as string),
    enabled: !!staffId,
  });
}
