import { todayIso } from '@/features/attendance/hooks';
import type { EventSummary } from './api';

/** Only worth flagging once the event's date has arrived — a future event is
 * trivially "not completed yet" and that's not useful information. */
export function eventStatus(item: EventSummary): { label: string; tone: 'success' | 'warning' } | null {
  if (item.completedAt) return { label: 'Completed', tone: 'success' };
  if (todayIso() >= (item.endsOn ?? item.startsOn)) return { label: 'Not completed', tone: 'warning' };
  return null;
}
