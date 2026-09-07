import { describe, expect, it } from 'vitest';
import { BASE_DELAY_MS, isDue, isStuck, MAX_AGE_MS, MAX_DELAY_MS, nextEligibleAt } from './backoff';

describe('nextEligibleAt', () => {
  it('is immediately eligible for a brand-new row (no attempts yet)', () => {
    expect(nextEligibleAt({ createdAt: 5000, lastAttemptAt: null, attempts: 0 })).toBe(5000);
  });

  it('waits BASE_DELAY_MS after the first failure', () => {
    const row = { createdAt: 0, lastAttemptAt: 1000, attempts: 1 };
    expect(nextEligibleAt(row)).toBe(1000 + BASE_DELAY_MS);
  });

  it('grows exponentially with each subsequent retry', () => {
    const at = (attempts: number) => nextEligibleAt({ createdAt: 0, lastAttemptAt: 0, attempts });
    expect(at(1)).toBe(BASE_DELAY_MS);
    expect(at(2)).toBe(BASE_DELAY_MS * 2);
    expect(at(3)).toBe(BASE_DELAY_MS * 4);
  });

  it('caps the wait at MAX_DELAY_MS', () => {
    const row = { createdAt: 0, lastAttemptAt: 0, attempts: 20 };
    expect(nextEligibleAt(row)).toBe(MAX_DELAY_MS);
  });
});

describe('isStuck', () => {
  it('is false before the 24h window elapses', () => {
    expect(isStuck({ createdAt: 0 }, MAX_AGE_MS - 1)).toBe(false);
  });

  it('is true once the 24h window has elapsed', () => {
    expect(isStuck({ createdAt: 0 }, MAX_AGE_MS + 1)).toBe(true);
  });
});

describe('isDue', () => {
  it('is immediately due the moment a fresh operation is enqueued', () => {
    const row = { createdAt: 1000, lastAttemptAt: null, attempts: 0, status: 'pending' };
    expect(isDue(row, 1000)).toBe(true);
  });

  it('is false for a failed row past the 24h window, even if its backoff delay has elapsed', () => {
    const row = { createdAt: 0, lastAttemptAt: 0, attempts: 1, status: 'failed' };
    expect(isDue(row, MAX_AGE_MS + BASE_DELAY_MS + 1)).toBe(false);
  });

  it('is false while still inside the backoff wait after a failure', () => {
    const row = { createdAt: 0, lastAttemptAt: 0, attempts: 3, status: 'pending' };
    expect(isDue(row, nextEligibleAt(row) - 1)).toBe(false);
  });

  it('is true once the backoff wait has elapsed', () => {
    const row = { createdAt: 0, lastAttemptAt: 0, attempts: 3, status: 'pending' };
    expect(isDue(row, nextEligibleAt(row))).toBe(true);
  });
});
