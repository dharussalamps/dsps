/**
 * PostgREST's `.or()` filter syntax uses commas to separate conditions and
 * parentheses to group them. Without escaping, a search term containing
 * those characters could inject additional filter conditions rather than
 * just matching text — strip them before interpolating user input into an
 * `.or()` expression.
 */
export function sanitizeFilterValue(raw: string): string {
  return raw.replace(/[,()]/g, ' ').trim();
}
