import type { IconName, PillTone } from '@/components';
import type { CalendarDayType } from './api';

/**
 * Shared icon/color/label per calendar_days.day_type — the single source both
 * AcademicCalendarScreen's "edited days" list and CalendarDayEditorScreen's
 * type picker draw from, so a holiday (say) reads as the same gold sun icon
 * everywhere instead of drifting between screens.
 */
export const DAY_TYPE_META: Record<CalendarDayType, { label: string; icon: IconName; tone: PillTone }> = {
  school: { label: 'School day', icon: 'school-outline', tone: 'success' },
  holiday: { label: 'Holiday', icon: 'sunny-outline', tone: 'gold' },
  half_day: { label: 'Half day', icon: 'partly-sunny-outline', tone: 'warning' },
  exam: { label: 'Exam', icon: 'document-text-outline', tone: 'info' },
  closure: { label: 'Closure', icon: 'close-circle-outline', tone: 'error' },
};
