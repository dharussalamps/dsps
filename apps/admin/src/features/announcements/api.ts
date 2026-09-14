import { supabase } from '@/lib/supabase';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: number;
  publishAt: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  isRead: boolean;
};

export const ANNOUNCEMENT_EDIT_WINDOW_MINUTES = 15;

/** UI-only gating mirroring update_announcement()'s own check (20260914030000_announcement_edit_window.sql) — that RPC is the real backstop. */
export function isAnnouncementEditable(announcement: Pick<Announcement, 'createdAt'>): boolean {
  const ageMs = Date.now() - new Date(announcement.createdAt).getTime();
  return ageMs <= ANNOUNCEMENT_EDIT_WINDOW_MINUTES * 60 * 1000;
}

/** UI-only gating mirroring delete_announcement()'s own "same calendar day" check for an
 * ordinary author (20260914050000_announcement_delete_rules.sql) — that RPC is the real
 * backstop, and separately lets anyone with 'announcement.publish_all' (principal, vice
 * principal, administrator) delete any announcement regardless of this. */
export function isAnnouncementDeletable(announcement: Pick<Announcement, 'createdAt'>): boolean {
  const created = new Date(announcement.createdAt);
  const now = new Date();
  return (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate()
  );
}

export async function fetchAnnouncements(staffId: string): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, priority, publish_at, created_at, author_id, staff!announcements_author_id_fkey(full_name)')
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .returns<{ id: string; title: string; body: string; priority: number; publish_at: string; created_at: string; author_id: string; staff: { full_name: string } | null }[]>();
  if (error) throw error;

  const { data: reads, error: readsError } = await supabase
    .from('announcement_reads')
    .select('announcement_id, read_at')
    .eq('staff_id', staffId);
  if (readsError) throw readsError;
  const readMap = new Map((reads ?? []).map((r) => [r.announcement_id, r.read_at != null]));

  return (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    publishAt: a.publish_at,
    createdAt: a.created_at,
    authorId: a.author_id,
    authorName: a.staff?.full_name ?? '',
    isRead: readMap.get(a.id) ?? false,
  }));
}

/** FR-ANN-05: "the publisher can see who has read an announcement" — and, just as importantly,
 * who the full recipient list is and who on it still hasn't. RLS (read_own_announcement_reads /
 * read_announcements) only lets this return something meaningful to someone who could already
 * see the recipient list — in practice, the author. */
export async function fetchAnnouncementReadStats(
  announcementId: string,
): Promise<{ readCount: number; totalCount: number; readerNames: string[]; unreadNames: string[] }> {
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('read_at, staff(full_name)')
    .eq('announcement_id', announcementId)
    .returns<{ read_at: string | null; staff: { full_name: string } | null }[]>();
  if (error) throw error;
  const rows = data ?? [];
  return {
    readCount: rows.filter((r) => r.read_at != null).length,
    totalCount: rows.length,
    readerNames: rows.filter((r) => r.read_at != null).map((r) => r.staff?.full_name ?? '').filter(Boolean).sort(),
    unreadNames: rows.filter((r) => r.read_at == null).map((r) => r.staff?.full_name ?? '').filter(Boolean).sort(),
  };
}

export async function fetchUnreadAnnouncementCount(staffId: string): Promise<number> {
  const { count, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAnnouncementRead(announcementId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('announcement_reads')
    .update({ read_at: new Date().toISOString() })
    .eq('announcement_id', announcementId)
    .eq('staff_id', staffId);
  if (error) throw error;
}

export type AudienceType = 'all_staff' | 'section' | 'class' | 'individuals';

export async function composeAnnouncement(input: {
  title: string;
  body: string;
  audience: AudienceType;
  audienceIds: string[];
  priority?: number;
  publishAt?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_announcement', {
    p_title: input.title,
    p_body: input.body,
    p_audience: input.audience,
    p_audience_ids: input.audienceIds.length > 0 ? input.audienceIds : null,
    p_priority: input.priority ?? 0,
    p_publish_at: input.publishAt ?? new Date().toISOString(),
  });
  if (error) throw error;
  return data as string;
}

export async function updateAnnouncement(input: { id: string; title: string; body: string; priority?: number }): Promise<void> {
  const { error } = await supabase.rpc('update_announcement', {
    p_announcement_id: input.id,
    p_title: input.title,
    p_body: input.body,
    p_priority: input.priority ?? 0,
  });
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_announcement', { p_announcement_id: id });
  if (error) throw error;
}
