import { useQuery } from '@tanstack/react-query';
import { useMyRoleKeys } from '@/features/accounts/hooks';
import { useAuthStore } from '@/store/authStore';
import { getEvent, listDiaryEntriesInMonth, listDiaryEntriesInYear, listEventsInMonth, listEventsInYear, type EventDetail } from './api';

export function useEventsInMonth(year: number, month: number, enabled = true) {
  return useQuery({ queryKey: ['events', 'month', year, month], queryFn: () => listEventsInMonth(year, month), enabled });
}

export function useEventsInYear(year: number, enabled = true) {
  return useQuery({ queryKey: ['events', 'year', year], queryFn: () => listEventsInYear(year), enabled });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId as string),
    enabled: !!eventId,
  });
}

export function useDiaryEntriesInMonth(year: number, month: number, enabled = true) {
  return useQuery({ queryKey: ['diary', 'month', year, month], queryFn: () => listDiaryEntriesInMonth(year, month), enabled });
}

export function useDiaryEntriesInYear(year: number, enabled = true) {
  return useQuery({ queryKey: ['diary', 'year', year], queryFn: () => listDiaryEntriesInYear(year), enabled });
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
 * or you're one of the event's responsible staff) — the RPC re-checks this itself and is the
 * real backstop, this just decides whether to show the button at all. */
export function useCanCompleteEvent(event: EventDetail | null | undefined): boolean {
  const staffId = useAuthStore((s) => s.staff?.id);
  const hasManageRole = useCanManageEvents();
  if (!event) return false;
  return hasManageRole || event.responsible.some((r) => r.id === staffId);
}
