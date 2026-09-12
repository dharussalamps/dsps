import { useQuery } from '@tanstack/react-query';
import { useMyRoleKeys } from '@/features/accounts/hooks';
import { useAuthStore } from '@/store/authStore';
import { getEvent, listDiaryEntries, listEventsInMonth, type EventDetail } from './api';

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

/** Mirrors event.manage's actual role grant (003_role_permissions.sql: principal gets every
 * permission, vice_principal gets every permission except a short excluded list that doesn't
 * include event.manage, administrator is granted it explicitly) — gates the Edit button, since
 * update_events (20260912170000_event_edit_delete.sql) allows any of these three to edit any
 * event, not just its own creator. UI-only; RLS is the real backstop. */
export function useCanManageEvents(): boolean {
  const { data: roleKeys } = useMyRoleKeys();
  return roleKeys?.some((k) => k === 'principal' || k === 'vice_principal' || k === 'administrator') ?? false;
}

/** UI-only gating that mirrors complete_event()'s own check (has_permission('event.manage')
 * or the event's responsible_id is you) — the RPC re-checks this itself and is the real
 * backstop, this just decides whether to show the button at all. */
export function useCanCompleteEvent(event: EventDetail | null | undefined): boolean {
  const staffId = useAuthStore((s) => s.staff?.id);
  const hasManageRole = useCanManageEvents();
  if (!event) return false;
  return hasManageRole || event.responsibleId === staffId;
}
