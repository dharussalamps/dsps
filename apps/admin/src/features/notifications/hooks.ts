import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { fetchMyNotifications, fetchUnreadNotificationCount } from './api';

export function useMyNotifications() {
  const staff = useAuthStore((s) => s.staff);
  return useQuery({ queryKey: ['notifications', 'mine'], queryFn: fetchMyNotifications, enabled: !!staff });
}

/** Polled — this is what drives the bell badge in ScreenHeader, present on every screen (FR-ANN-06's "reachable from every screen" pattern, applied to notifications generally). */
export function useUnreadNotificationCount() {
  const staff = useAuthStore((s) => s.staff);
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadNotificationCount,
    enabled: !!staff,
    refetchInterval: 45_000,
  });
}
