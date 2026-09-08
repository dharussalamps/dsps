import { getDb } from './db';

/**
 * NFR-SEC-06: "Locally cached data is removed from the device on sign-out
 * and on account deactivation." The SQLite tables this app writes hold real
 * student PII (cached_roster) and queued domain writes (pending_operations)
 * keyed to whoever was signed in — both belong to the identity that's
 * leaving, so both are wiped. Table names are matched by prefix/`like`
 * rather than an explicit list so a feature module that registers its own
 * local table (see registerLocalSchema in db.ts) is covered automatically
 * without this file needing to know about it.
 */
export async function clearAllLocalData(): Promise<void> {
  try {
    const db = await getDb();
    const tables = await db.getAllAsync<{ name: string }>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    );
    await db.withTransactionAsync(async () => {
      for (const { name } of tables) {
        await db.runAsync(`delete from "${name}"`);
      }
    });
  } catch {
    // Best-effort: a missing/locked local DB must never block sign-out.
  }
}

/** True if there is domain data on-device that hasn't reached the server yet. */
export async function hasUnsyncedOperations(): Promise<boolean> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ n: number }>(
      "select count(*) as n from pending_operations where status in ('pending', 'syncing', 'failed')",
    );
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
