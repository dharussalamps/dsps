import { supabase } from '@/lib/supabase';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: number;
  publishAt: string;
  authorName: string;
  isRead: boolean;
};

export async function fetchAnnouncements(staffId: string): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, priority, publish_at, staff!announcements_author_id_fkey(full_name)')
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .returns<{ id: string; title: string; body: string; priority: number; publish_at: string; staff: { full_name: string } | null }[]>();
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
    authorName: a.staff?.full_name ?? '',
    isRead: readMap.get(a.id) ?? false,
  }));
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
