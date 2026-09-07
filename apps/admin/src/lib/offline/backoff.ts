/**
 * Pure retry/backoff math for the offline queue (AdminSpec.md section 9,
 * rule 3), kept free of any native import so it's testable under Vitest —
 * queue.ts (which does import expo-sqlite/expo-crypto) delegates to this.
 */

export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 60 * 60 * 1000;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RetryableRow = {
  createdAt: number;
  lastAttemptAt: number | null;
  attempts: number;
};

/**
 * The earliest time this row should be attempted again. The very first
 * attempt (attempts === 0) is always immediately eligible — backoff only
 * applies to retries after a failure, counting from the failed attempt.
 */
export function nextEligibleAt(row: RetryableRow): number {
  if (row.attempts === 0) return row.createdAt;
  const base = row.lastAttemptAt ?? row.createdAt;
  const delay = Math.min(BASE_DELAY_MS * 2 ** (row.attempts - 1), MAX_DELAY_MS);
  return base + delay;
}

/** True once the 24h auto-retry window has elapsed since the operation was first queued. */
export function isStuck(row: Pick<RetryableRow, 'createdAt'>, now: number): boolean {
  return now - row.createdAt > MAX_AGE_MS;
}

/** Whether this row should be attempted on this drain pass. */
export function isDue(row: RetryableRow & { status: string }, now: number): boolean {
  if (row.status === 'failed' && isStuck(row, now)) return false;
  return now >= nextEligibleAt(row);
}
