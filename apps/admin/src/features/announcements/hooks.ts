import { useQuery } from '@tanstack/react-query';
import { fetchAnnouncements, fetchUnreadAnnouncementCount } from './api';

export function useAnnouncements(staffId: string | undefined) {
  return useQuery({
    queryKey: ['announcements', staffId],
    queryFn: () => fetchAnnouncements(staffId as string),
    enabled: !!staffId,
  });
}

/** Badge count for the drawer/tab icon — counts pending (unread) announcement_reads rows, not the announcements list itself. */
export function useUnreadAnnouncementCount(staffId: string | undefined) {
  return useQuery({
    queryKey: ['announcements', 'unread-count', staffId],
    queryFn: () => fetchUnreadAnnouncementCount(staffId as string),
    enabled: !!staffId,
  });
}
