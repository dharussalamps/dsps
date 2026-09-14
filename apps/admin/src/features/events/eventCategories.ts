import type { IconName, PillTone } from '@/components';

export type CategoryPreset = { key: string; label: string; icon: IconName; tone: PillTone };

/** Quick-select presets shown as chips on the event form and used to color/iconify a category
 * everywhere it's displayed. `category` itself stays freeform text in the DB — a value typed
 * before these presets existed (or anything custom) just falls back to the default look below. */
export const EVENT_CATEGORY_PRESETS: CategoryPreset[] = [
  { key: 'exam', label: 'Exam', icon: 'document-text-outline', tone: 'info' },
  { key: 'sports', label: 'Sports', icon: 'football-outline', tone: 'success' },
  { key: 'holiday', label: 'Holiday', icon: 'sunny-outline', tone: 'gold' },
  { key: 'meeting', label: 'Meeting', icon: 'people-outline', tone: 'neutral' },
  { key: 'cultural', label: 'Cultural', icon: 'musical-notes-outline', tone: 'warning' },
  { key: 'celebration', label: 'Celebration', icon: 'sparkles-outline', tone: 'gold' },
];

const DEFAULT_CATEGORY_STYLE: { icon: IconName; tone: PillTone } = { icon: 'star-outline', tone: 'neutral' };

export function categoryStyle(category: string | null | undefined): { icon: IconName; tone: PillTone } {
  const preset = EVENT_CATEGORY_PRESETS.find((p) => p.key === (category ?? '').trim().toLowerCase());
  return preset ? { icon: preset.icon, tone: preset.tone } : DEFAULT_CATEGORY_STYLE;
}
