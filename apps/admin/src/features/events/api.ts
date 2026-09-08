import { supabase } from '@/lib/supabase';

export type EventSummary = { id: string; title: string; startsOn: string; endsOn: string | null; category: string | null };

export async function listEventsInMonth(year: number, month: number): Promise<EventSummary[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  const { data, error } = await supabase
    .from('events')
    .select('id, title, starts_on, ends_on, category')
    .gte('starts_on', start)
    .lte('starts_on', end)
    .order('starts_on');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, startsOn: r.starts_on, endsOn: r.ends_on, category: r.category }));
}

export type EventDetail = EventSummary & { description: string | null; location: string | null; responsibleName: string | null };

export async function getEvent(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, starts_on, ends_on, category, description, location, staff!events_responsible_id_fkey(full_name)')
    .eq('id', eventId)
    .maybeSingle()
    .returns<{ id: string; title: string; starts_on: string; ends_on: string | null; category: string | null; description: string | null; location: string | null; staff: { full_name: string } | null } | null>();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, title: data.title, startsOn: data.starts_on, endsOn: data.ends_on, category: data.category, description: data.description, location: data.location, responsibleName: data.staff?.full_name ?? null };
}

export async function createEvent(input: {
  title: string;
  description?: string;
  category?: string;
  startsOn: string;
  endsOn?: string;
  location?: string;
  responsibleId?: string;
  reminderDays?: number[];
  createdBy: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      title: input.title,
      description: input.description || null,
      category: input.category || null,
      starts_on: input.startsOn,
      ends_on: input.endsOn || null,
      location: input.location || null,
      responsible_id: input.responsibleId || null,
      reminder_days: input.reminderDays && input.reminderDays.length > 0 ? input.reminderDays : undefined,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export type DiaryEntry = { id: string; onDate: string; title: string; body: string | null; authorName: string };

export async function listDiaryEntries(year: number): Promise<DiaryEntry[]> {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('id, on_date, title, body, staff!diary_entries_author_id_fkey(full_name)')
    .gte('on_date', `${year}-01-01`)
    .lte('on_date', `${year}-12-31`)
    .order('on_date', { ascending: false })
    .returns<{ id: string; on_date: string; title: string; body: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, onDate: r.on_date, title: r.title, body: r.body, authorName: r.staff?.full_name ?? '' }));
}

export async function addDiaryEntry(input: { onDate: string; title: string; body?: string; eventId?: string; authorId: string }): Promise<void> {
  const { error } = await supabase.from('diary_entries').insert({
    on_date: input.onDate,
    title: input.title,
    body: input.body || null,
    event_id: input.eventId || null,
    author_id: input.authorId,
  });
  if (error) throw error;
}
