import { supabase } from '@/lib/supabase';

export type EventSummary = {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string | null;
  category: string | null;
  completedAt: string | null;
  responsible: { id: string; fullName: string }[];
};

type EventSummaryRow = {
  id: string;
  title: string;
  starts_on: string;
  ends_on: string | null;
  category: string | null;
  completed_at: string | null;
  event_responsible_staff: { staff: { id: string; full_name: string } | null }[];
};

function mapEventSummaryRow(r: EventSummaryRow): EventSummary {
  return {
    id: r.id,
    title: r.title,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    category: r.category,
    completedAt: r.completed_at,
    responsible: r.event_responsible_staff
      .map((rs) => rs.staff)
      .filter((s): s is { id: string; full_name: string } => s !== null)
      .map((s) => ({ id: s.id, fullName: s.full_name })),
  };
}

async function listEventsBetween(start: string, end: string): Promise<EventSummary[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, starts_on, ends_on, category, completed_at, event_responsible_staff(staff(id, full_name))')
    .gte('starts_on', start)
    .lte('starts_on', end)
    .order('starts_on')
    .returns<EventSummaryRow[]>();
  if (error) throw error;
  return (data ?? []).map(mapEventSummaryRow);
}

export async function listEventsInMonth(year: number, month: number): Promise<EventSummary[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return listEventsBetween(start, end);
}

export async function listEventsInYear(year: number): Promise<EventSummary[]> {
  return listEventsBetween(`${year}-01-01`, `${year}-12-31`);
}

export type EventDetail = EventSummary & {
  description: string | null;
  location: string | null;
  responsible: { id: string; fullName: string }[];
  reminderDays: number[];
  completedAt: string | null;
  completedByName: string | null;
  /** True once any diary entry references this event — via auto-complete or a manual
   * "Add to diary" — matching delete_event()'s own has_diary_entries check. Not just
   * completedAt: a manual diary entry can exist on an event that's never been completed. */
  hasDiaryEntry: boolean;
};

export async function getEvent(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, starts_on, ends_on, category, description, location, reminder_days, completed_at, ' +
        'event_responsible_staff(staff(id, full_name)), completed_by_staff:staff!events_completed_by_fkey(full_name)',
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
      reminder_days: number[];
      completed_at: string | null;
      event_responsible_staff: { staff: { id: string; full_name: string } | null }[];
      completed_by_staff: { full_name: string } | null;
    } | null>();
  if (error) throw error;
  if (!data) return null;

  const { count: diaryCount, error: diaryError } = await supabase
    .from('diary_entries')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  if (diaryError) throw diaryError;

  return {
    id: data.id,
    title: data.title,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    category: data.category,
    description: data.description,
    location: data.location,
    responsible: data.event_responsible_staff
      .map((r) => r.staff)
      .filter((s): s is { id: string; full_name: string } => s !== null)
      .map((s) => ({ id: s.id, fullName: s.full_name })),
    reminderDays: data.reminder_days ?? [],
    completedAt: data.completed_at,
    completedByName: data.completed_by_staff?.full_name ?? null,
    hasDiaryEntry: (diaryCount ?? 0) > 0,
  };
}

/** Marks an event completed and auto-creates its school diary entry — see complete_event() in
 * 20260914010000_event_multiple_responsible.sql for the permission check (principal/admin or one of
 * the event's responsible staff), the on-or-after-schedule date gate, and the diary insert, all done atomically. */
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
  responsibleIds?: string[];
  reminderDays?: number[];
};

async function setEventResponsibleStaff(eventId: string, staffIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('event_responsible_staff').delete().eq('event_id', eventId);
  if (deleteError) throw deleteError;
  if (staffIds.length === 0) return;
  const { error: insertError } = await supabase
    .from('event_responsible_staff')
    .insert(staffIds.map((staffId) => ({ event_id: eventId, staff_id: staffId })));
  if (insertError) throw insertError;
}

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
      reminder_days: input.reminderDays && input.reminderDays.length > 0 ? input.reminderDays : undefined,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (input.responsibleIds && input.responsibleIds.length > 0) {
    await setEventResponsibleStaff(data.id, input.responsibleIds);
  }
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
      // Unlike create (where an unset field just keeps the column's DB
      // default), an edit that clears "reminder lead times" means the user
      // wants no reminders — so this always writes a concrete array.
      reminder_days: input.reminderDays ?? [],
    })
    .eq('id', eventId);
  if (error) throw error;
  await setEventResponsibleStaff(eventId, input.responsibleIds ?? []);
}

export type DiaryEntry = { id: string; onDate: string; title: string; body: string | null; authorName: string };

async function listDiaryEntriesBetween(start: string, end: string): Promise<DiaryEntry[]> {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('id, on_date, title, body, staff!diary_entries_author_id_fkey(full_name)')
    .gte('on_date', start)
    .lte('on_date', end)
    .order('on_date', { ascending: false })
    .returns<{ id: string; on_date: string; title: string; body: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, onDate: r.on_date, title: r.title, body: r.body, authorName: r.staff?.full_name ?? '' }));
}

export async function listDiaryEntriesInMonth(year: number, month: number): Promise<DiaryEntry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return listDiaryEntriesBetween(start, end);
}

export async function listDiaryEntriesInYear(year: number): Promise<DiaryEntry[]> {
  return listDiaryEntriesBetween(`${year}-01-01`, `${year}-12-31`);
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

export async function updateDiaryEntry(id: string, input: { onDate: string; title: string; body?: string }): Promise<void> {
  const { error } = await supabase
    .from('diary_entries')
    .update({ on_date: input.onDate, title: input.title, body: input.body || null })
    .eq('id', id);
  if (error) throw error;
}

/** See delete_diary_entries in 20260914020000_diary_edit_delete_policies.sql — gated on
 * diary.manage, not just the entry's own author, so a principal can remove any entry. */
export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('diary_entries').delete().eq('id', id);
  if (error) throw error;
}
