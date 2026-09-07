import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

/**
 * Session-only for now. Once build task 4's RLS policies exist (Phase 2),
 * this store grows a `staff` profile and the resolved permission grants
 * (see src/lib/permissions.ts) fetched right after sign-in.
 */
type AuthState = {
  status: 'initializing' | 'signedOut' | 'signedIn';
  session: Session | null;
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  session: null,
  setSession: (session) => set({ session, status: session ? 'signedIn' : 'signedOut' }),
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));

/** Call once at app start; returns the unsubscribe function. */
export function initAuthListener(): () => void {
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.getState().setSession(data.session);
  });

  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
  });

  return () => subscription.subscription.unsubscribe();
}
