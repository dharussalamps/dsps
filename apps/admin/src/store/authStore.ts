import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { create } from 'zustand';
import { isBiometricUnlockEnabled } from '@/lib/biometrics';
import { clearAllLocalData } from '@/lib/offline/clearLocalData';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

export type StaffProfile = {
  id: string;
  fullName: string;
  staffNo: string;
  /** 'YYYY-MM-DD', or null if never set — powers the Home screen's birthday greeting. */
  birthDate: string | null;
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
  setSession: (session: Session | null, opts?: { isInitial?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshStaffProfile: () => Promise<void>;
  /** True once a deactivation has been detected, so the UI can show why the session ended. */
  deactivated: boolean;
  clearDeactivatedFlag: () => void;
  /** FR-AUTH-04: gates an already-valid session behind a biometric prompt — see useBiometricLock(). */
  locked: boolean;
  unlock: () => void;
  armLock: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'initializing',
  session: null,
  staff: null,
  deactivated: false,
  locked: false,

  setSession: async (session, opts) => {
    if (!session) {
      set({ session: null, staff: null, status: 'signedOut', locked: false });
      return;
    }
    if (session.user.user_metadata?.needs_password_set) {
      set({ session, staff: null, status: 'needsPasswordSet' });
      return;
    }
    // A cold start / app resume that finds an already-valid session
    // ("INITIAL_SESSION") is exactly the "subsequent session" FR-AUTH-04
    // describes — locked behind biometrics if the user turned that on.
    // Typing a password just now (a real SIGNED_IN event) never needs a
    // second prompt immediately after.
    const shouldLock = !!opts?.isInitial && (await isBiometricUnlockEnabled());
    set({ session, status: 'signedIn', locked: shouldLock });
    await get().refreshStaffProfile();
  },

  unlock: () => set({ locked: false }),

  armLock: async () => {
    if (get().status === 'signedIn' && (await isBiometricUnlockEnabled())) {
      set({ locked: true });
    }
  },

  // NFR-SEC-06: locally cached data — the query cache and the on-device
  // SQLite tables (cached roster, queued offline writes) — is wiped on
  // every sign-out, deliberate or forced by deactivation (see
  // useSessionLiveness below). Order matters: clear local state first,
  // then end the Supabase session, so a slow/offline signOut() call can
  // never leave stale cached data behind under a session that's already
  // gone.
  signOut: async () => {
    queryClient.clear();
    await clearAllLocalData();
    await supabase.auth.signOut();
  },

  clearDeactivatedFlag: () => set({ deactivated: false }),

  refreshStaffProfile: async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, staff_no, birth_date')
      .eq('auth_user_id', get().session?.user.id)
      .maybeSingle();
    if (error || !data) {
      set({ staff: null });
      return;
    }
    set({ staff: { id: data.id, fullName: data.full_name, staffNo: data.staff_no, birthDate: data.birth_date } });
  },
}));

/**
 * FR-AUTH-06 / NFR-SEC-06: "a deactivated account cannot sign in and its
 * existing sessions end within one minute." current_staff_id() already
 * fails every server-side read/write closed for a deactivated user (see
 * backend/supabase/migrations/20260907090010_permission_functions.sql),
 * but a device that's simply sitting on a cached screen might not issue
 * any query for a while. Polling assert_active_session() while signed in —
 * and on every app foreground, which is when a device is actually being
 * used again — is what makes "within one minute" true in practice rather
 * than "eventually, next time something happens to ask."
 */
const LIVENESS_POLL_MS = 45_000;

export function useSessionLiveness(): void {
  const status = useAuthStore((s) => s.status);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function check() {
    if (useAuthStore.getState().status !== 'signedIn') return;
    const { data, error } = await supabase.rpc('assert_active_session');
    if (error) return; // offline or transient — don't sign the user out for that
    if (data === false) {
      set_deactivated_and_sign_out();
    }
  }

  async function set_deactivated_and_sign_out() {
    useAuthStore.setState({ deactivated: true });
    await useAuthStore.getState().signOut();
    Alert.alert('Signed out', 'Your account is no longer active. Contact an administrator if this is unexpected.');
  }

  useEffect(() => {
    if (status !== 'signedIn') {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    void check();
    timer.current = setInterval(() => void check(), LIVENESS_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}

/**
 * FR-AUTH-04, continued: re-arms the lock whenever the app is backgrounded
 * (not just at cold start) — that's the "device biometric unlock" a user
 * turning the setting on actually expects, not only a once-per-install
 * gate. Mount once at the app root, alongside useSessionLiveness.
 */
export function useBiometricLock(): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        void useAuthStore.getState().armLock();
      }
    });
    return () => sub.remove();
  }, [status]);
}

/** Call once at app start; returns the unsubscribe function. */
export function initAuthListener(): () => void {
  supabase.auth.getSession().then(({ data }) => {
    void useAuthStore.getState().setSession(data.session, { isInitial: true });
  });

  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    void useAuthStore.getState().setSession(session, { isInitial: event === 'INITIAL_SESSION' });
  });

  return () => subscription.subscription.unsubscribe();
}
