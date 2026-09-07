import * as SQLite from 'expo-sqlite';

/**
 * Local schema per AdminSpec.md section 9, with one addition:
 * `last_attempt_at` is not in the spec's table, but exponential backoff
 * capped at 24 hours (section 9, rule 3) can't be computed correctly
 * across app restarts without knowing when the last attempt happened —
 * `attempts` alone isn't enough. See docs/AdminSpec.md section 17.
 */
const SCHEMA = `
  pragma journal_mode = WAL;
  create table if not exists pending_operations (
    id              text primary key,
    operation       text not null,
    payload         text not null,
    created_at      integer not null,
    attempts        integer not null default 0,
    last_error      text,
    status          text not null default 'pending',
    last_attempt_at integer
  );
  create index if not exists pending_operations_status on pending_operations (status, created_at);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Lazily opens (and migrates) the on-device database. Safe to call from anywhere, any number of times. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('school-admin.db').then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}

/**
 * Feature modules that need their own local tables (e.g. the cached class
 * roster for offline marking, build task 9) call this once at startup to
 * extend the schema, keeping table definitions next to the code that owns
 * them rather than centralizing every table here.
 */
export async function registerLocalSchema(sql: string): Promise<void> {
  const db = await getDb();
  await db.execAsync(sql);
}
