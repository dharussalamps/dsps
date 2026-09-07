import { supabase } from '@/lib/supabase';

export async function registerDevice(staffId: string, pushToken: string, platform: string): Promise<void> {
  const { error } = await supabase.from('devices').upsert(
    { staff_id: staffId, push_token: pushToken, platform, last_seen_at: new Date().toISOString() },
    { onConflict: 'push_token' },
  );
  if (error) throw error;
}

export async function unregisterDevice(pushToken: string): Promise<void> {
  const { error } = await supabase.from('devices').delete().eq('push_token', pushToken);
  if (error) throw error;
}

export async function isDeviceRegistered(pushToken: string): Promise<boolean> {
  const { data, error } = await supabase.from('devices').select('push_token').eq('push_token', pushToken).maybeSingle();
  if (error) throw error;
  return data != null;
}
