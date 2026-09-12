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

export type EventDetail = EventSummary & {
  description: string | null;
  location: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  reminderDays: number[];
  completedAt: string | null;
  completedByName: string | null;
};

export async function getEvent(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, starts_on, ends_on, category, description, location, responsible_id, reminder_days, completed_at, ' +
        'staff!events_responsible_id_fkey(full_name), completed_by_staff:staff!events_completed_by_fkey(full_name)',
    )
    .eq('id', eventId)
    .maybeSingle()
    .returns<{
      id: string;
      title: string;
      starts_on: string;
      ends_on: string | null;
      category: string | null;
      description: string | null;
      location: string | null;
      responsible_id: string | null;
      reminder_days: number[];
      completed_at: string | null;
      staff: { full_name: string } | null;
      completed_by_staff: { full_name: string } | null;
    } | null>();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    category: data.category,
    description: data.description,
    location: data.location,
    responsibleId: data.responsible_id,
    responsibleName: data.staff?.full_name ?? null,
    reminderDays: data.reminder_days ?? [],
    completedAt: data.completed_at,
    completedByName: data.completed_by_staff?.full_name ?? null,
  };
}

/** Marks an event completed and auto-creates its school diary entry — see complete_event() in
 * 20260912160000_event_mark_completed.sql for the permission check (principal/admin or the event's
 * own responsible staff), the on-or-after-schedule date gate, and the diary insert, all done atomically. */
export async function completeEvent(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('complete_event', { p_event_id: eventId });
  if (error) throw error;
  return data as string;
}

/** Deletes an event — see delete_event() in 20260912160000_event_mark_completed.sql, which refuses
 * (with a friendly 'has_diary_entries' error) once any diary entry references it, automatic or manual. */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_event', { p_event_id: eventId });
  if (error) throw error;
}

export type EventInput = {
  title: string;
  description?: string;
  category?: string;
  startsOn: string;
  endsOn?: string;
  location?: string;
  responsibleId?: string;
  reminderDays?: number[];
};

export async function createEvent(input: EventInput & { createdBy: string }): Promise<string> {
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

export async function updateEvent(eventId: string, input: EventInput): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({
      title: input.title,
      description: input.description || null,
      category: input.category || null,
      starts_on: input.startsOn,
      ends_on: input.endsOn || null,
      location: input.location || null,
      responsible_id: input.responsibleId || null,
      // Unlike create (where an unset field just keeps the column's DB
      // default), an edit that clears "reminder lead times" means the user
      // wants no reminders — so this always writes a concrete array.
      reminder_days: input.reminderDays ?? [],
    })
    .eq('id', eventId);
  if (error) throw error;
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
