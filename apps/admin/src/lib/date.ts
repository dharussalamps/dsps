const DMY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a 'DD/MM/YYYY' string typed by a user into an ISO 'YYYY-MM-DD' date, or null if it isn't a valid calendar date in that format. */
export function parseDMY(value: string): string | null {
  const match = DMY_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Formats an ISO 'YYYY-MM-DD' date as 'DD/MM/YYYY' for display in a typed date field. Returns '' for anything else. */
export function toDMY(iso: string | null | undefined): string {
  const match = ISO_PATTERN.exec((iso ?? '').trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/**
 * Reformats whatever a user just typed/deleted into a 'DD/MM/YYYY' field so
 * the '/' separators appear on their own as each group fills in — digits
 * only, capped at 8, grouped 2-2-4. A '/' is only ever emitted once the
 * next group has a digit in it, so backspacing never gets stuck on a
 * trailing separator the way an always-append version would.
 */
export function formatDMYInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Whether today's date falls within an ISO 'YYYY-MM-DD' range (inclusive) — flags e.g. the current term/year from an already-fetched list without a second query. */
export function isCurrentPeriod(startsOnIso: string, endsOnIso: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return startsOnIso <= today && today <= endsOnIso;
}
