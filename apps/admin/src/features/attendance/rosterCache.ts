import { getDb, registerLocalSchema } from '@/lib/offline/db';

/**
 * AdminSpec.md section 9, rule 4: "The roster for a teacher's own class is
 * cached locally and refreshed on each successful sync, so the marking
 * screen opens offline." This table is separate from the generic offline
 * engine (src/lib/offline) because it's this feature's own concern.
 */
export type CachedRosterStudent = {
  id: string;
  fullName: string;
  preferredName: string | null;
  photoPath: string | null;
  rollNo: string | null;
};

export async function initRosterCacheSchema(): Promise<void> {
  await registerLocalSchema(`
    create table if not exists cached_roster (
      class_id   text not null,
      student_id text not null,
      payload    text not null,
      position   integer not null,
      cached_at  integer not null,
      primary key (class_id, student_id)
    );
  `);
}

export async function cacheRoster(classId: string, students: CachedRosterStudent[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from cached_roster where class_id = ?', [classId]);
    for (let i = 0; i < students.length; i++) {
      await db.runAsync(
        'insert into cached_roster (class_id, student_id, payload, position, cached_at) values (?, ?, ?, ?, ?)',
        [classId, students[i].id, JSON.stringify(students[i]), i, now],
      );
    }
  });
}

export async function getCachedRoster(classId: string): Promise<CachedRosterStudent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    'select payload from cached_roster where class_id = ? order by position',
    [classId],
  );
  return rows.map((r) => JSON.parse(r.payload) as CachedRosterStudent);
}
