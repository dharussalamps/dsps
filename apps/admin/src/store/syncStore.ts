import { create } from 'zustand';

/**
 * AdminSpec.md section 9, rule 5: the UI shows sync state at all times — a
 * synced tick, a pending badge with count, or an error banner. This store
 * is the single source of truth the offline queue engine updates and
 * every screen's sync indicator reads from.
 */
export type SyncState = {
  pendingCount: number;
  /** true once at least one operation has exhausted the 24h auto-retry window (section 9, rule 3). */
  hasStuckError: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  setStatus: (partial: Partial<Omit<SyncState, 'setStatus'>>) => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  hasStuckError: false,
  isOnline: true,
  isSyncing: false,
  setStatus: (partial) => set(partial),
}));
