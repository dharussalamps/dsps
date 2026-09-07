import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSyncStore } from '@/store/syncStore';
import { drainQueue, refreshSyncStatus } from './queue';
import { isOnline, onConnectivityChange } from './network';

/**
 * Wires the three drain triggers from AdminSpec.md section 9, rule 2: app
 * foreground, network regain, and every 60 seconds while online. Mount
 * once near the app root (see App.tsx) — safe to mount more than once
 * since drainQueue() collapses concurrent calls, but there's no reason to.
 */
export function useSyncEngine(): void {
  useEffect(() => {
    let cancelled = false;

    void refreshSyncStatus();
    void isOnline().then((online) => {
      if (!cancelled) useSyncStore.getState().setStatus({ isOnline: online });
      if (online) void drainQueue();
    });

    const unsubscribeNetwork = onConnectivityChange((online) => {
      useSyncStore.getState().setStatus({ isOnline: online });
      if (online) void drainQueue();
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });

    const interval = setInterval(() => {
      if (useSyncStore.getState().isOnline) void drainQueue();
    }, 60_000);

    return () => {
      cancelled = true;
      unsubscribeNetwork();
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, []);
}
