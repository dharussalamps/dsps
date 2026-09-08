import { supabase } from '@/lib/supabase';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: number;
  publishAt: string;
  authorId: string;
  authorName: string;
  isRead: boolean;
};

export async function fetchAnnouncements(staffId: string): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, priority, publish_at, author_id, staff!announcements_author_id_fkey(full_name)')
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .returns<{ id: string; title: string; body: string; priority: number; publish_at: string; author_id: string; staff: { full_name: string } | null }[]>();
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
    authorId: a.author_id,
    authorName: a.staff?.full_name ?? '',
    isRead: readMap.get(a.id) ?? false,
  }));
}

/** FR-ANN-05: "the publisher can see who has read an announcement." RLS (read_own_announcement_reads / read_announcements) only lets this return something meaningful to someone who could already see the recipient list — in practice, the author. */
export async function fetchAnnouncementReadStats(announcementId: string): Promise<{ readCount: number; totalCount: number; readerNames: string[] }> {
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
    readerNames: rows.filter((r) => r.read_at != null).map((r) => r.staff?.full_name ?? '').filter(Boolean),
  };
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
