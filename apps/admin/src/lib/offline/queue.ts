import * as Crypto from 'expo-crypto';
import { useSyncStore } from '@/store/syncStore';
import { isDue, isStuck } from './backoff';
import { getDb } from './db';

/**
 * AdminSpec.md section 9. Only these three operations are offline-capable.
 * Feature modules register a handler for their own operation via
 * registerOperationHandler() when they mount (build tasks 9, 12, 14) —
 * this module stays generic and doesn't know how to actually submit
 * attendance or marks.
 */
export type OperationType = 'submit_attendance' | 'early_leave' | 'save_marks';

type OperationHandler = (payload: unknown, clientSubmissionId: string) => Promise<void>;

type PendingRow = {
  id: string;
  operation: string;
  payload: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  status: string;
  last_attempt_at: number | null;
};

const handlers = new Map<OperationType, OperationHandler>();

let draining = false;

export function registerOperationHandler(operation: OperationType, handler: OperationHandler): void {
  handlers.set(operation, handler);
}

/** Queues an offline-capable write. Returns the client_submission_id the caller's handler must send to the server. */
export async function enqueueOperation(operation: OperationType, payload: unknown): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  await db.runAsync(
    'insert into pending_operations (id, operation, payload, created_at, attempts, status) values (?, ?, ?, ?, 0, ?)',
    [id, operation, JSON.stringify(payload), Date.now(), 'pending'],
  );
  await refreshSyncStatus();
  void drainQueue();
  return id;
}

/** Drains oldest-first, one operation at a time (rule 2). Safe to call repeatedly — concurrent calls collapse into one. */
export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  useSyncStore.getState().setStatus({ isSyncing: true });

  try {
    const db = await getDb();
    const rows = await db.getAllAsync<PendingRow>(
      "select * from pending_operations where status in ('pending', 'failed') order by created_at asc",
    );

    for (const row of rows) {
      const now = Date.now();
      const dueRow = { createdAt: row.created_at, lastAttemptAt: row.last_attempt_at, attempts: row.attempts, status: row.status };
      if (!isDue(dueRow, now)) continue;

      const handler = handlers.get(row.operation as OperationType);
      if (!handler) continue; // feature module hasn't registered yet; try again next drain

      await db.runAsync("update pending_operations set status = 'syncing' where id = ?", [row.id]);
      try {
        await handler(JSON.parse(row.payload), row.id);
        await db.runAsync('delete from pending_operations where id = ?', [row.id]);
      } catch (err) {
        const attempts = row.attempts + 1;
        const attemptedAt = Date.now();
        const stuck = isStuck({ createdAt: row.created_at }, attemptedAt);
        await db.runAsync(
          'update pending_operations set attempts = ?, last_error = ?, last_attempt_at = ?, status = ? where id = ?',
          [attempts, errorMessage(err), attemptedAt, stuck ? 'failed' : 'pending', row.id],
        );
      }
    }
  } finally {
    draining = false;
    await refreshSyncStatus();
    useSyncStore.getState().setStatus({ isSyncing: false });
  }
}

/** Resets a stuck (24h-exhausted) operation and retries it immediately — the "manual retry" from rule 3. */
export async function manualRetry(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    "update pending_operations set attempts = 0, created_at = ?, last_attempt_at = null, last_error = null, status = 'pending' where id = ?",
    [now, id],
  );
  await drainQueue();
}

export async function refreshSyncStatus(): Promise<void> {
  const db = await getDb();
  const pending = await db.getFirstAsync<{ count: number }>(
    "select count(*) as count from pending_operations where status in ('pending', 'syncing')",
  );
  const stuck = await db.getFirstAsync<{ count: number }>(
    "select count(*) as count from pending_operations where status = 'failed'",
  );
  useSyncStore.getState().setStatus({
    pendingCount: pending?.count ?? 0,
    hasStuckError: (stuck?.count ?? 0) > 0,
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
