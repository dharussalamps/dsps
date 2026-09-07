import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type StaffProfile = {
  id: string;
  fullName: string;
  staffNo: string;
};

/**
 * Convention (not specified in AdminSpec.md — see docs/AdminSpec.md section
 * 17): an account created by an administrator (build task 21) has no
 * password set yet and carries `user_metadata.needs_password_set = true`.
 * SetPassword clears it after the user chooses a real password. This is
 * how "SetPassword: authenticated, first login" (section 10) is detected.
 */
type Status = 'initializing' | 'signedOut' | 'needsPasswordSet' | 'signedIn';

type AuthState = {
  status: Status;
  session: Session | null;
  staff: StaffProfile | null;
  setSession: (session: Session | null) => Promise<void>;
  signOut: () => Promise<void>;
  refreshStaffProfile: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'initializing',
  session: null,
  staff: null,

  setSession: async (session) => {
    if (!session) {
      set({ session: null, staff: null, status: 'signedOut' });
      return;
    }
    if (session.user.user_metadata?.needs_password_set) {
      set({ session, staff: null, status: 'needsPasswordSet' });
      return;
    }
    set({ session, status: 'signedIn' });
    await get().refreshStaffProfile();
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  refreshStaffProfile: async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, staff_no')
      .eq('auth_user_id', get().session?.user.id)
      .maybeSingle();
    if (error || !data) {
      set({ staff: null });
      return;
    }
    set({ staff: { id: data.id, fullName: data.full_name, staffNo: data.staff_no } });
  },
}));

/** Call once at app start; returns the unsubscribe function. */
export function initAuthListener(): () => void {
  supabase.auth.getSession().then(({ data }) => {
    void useAuthStore.getState().setSession(data.session);
  });

  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    void useAuthStore.getState().setSession(session);
  });

  return () => subscription.subscription.unsubscribe();
}
