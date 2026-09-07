// AdminSpec.md section 8: GET /export-report — "Generates a spreadsheet
// for a chosen report and returns a signed URL." This is genuinely a
// case for an Edge Function (unlike assign-cover): generating a CSV file
// and creating a signed Storage URL isn't something a Postgres function
// can do on its own.
//
// Uses the caller's own Authorization header (not the service role), so
// both the attendance_summaries read and the Storage upload go through
// their own RLS/storage policies — a caller without report.export gets
// rejected by the 'write_exports' storage policy, not by this function
// pretending to check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsPreflightResponse, dbErrorToResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const querySchema = z.object({
  report: z.literal('attendance_summary'),
  term_id: z.string().uuid(),
  scope_type: z.enum(['student', 'class', 'grade', 'school']).optional(),
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))];
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse(401, { code: 'unauthenticated', message: 'Missing Authorization header.' });

  const url = new URL(req.url);
  let query: z.infer<typeof querySchema>;
  try {
    query = querySchema.parse({
      report: url.searchParams.get('report'),
      term_id: url.searchParams.get('term_id'),
      scope_type: url.searchParams.get('scope_type') ?? undefined,
    });
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0] : undefined;
    return errorResponse(400, { code: 'invalid_query', message: issue?.message ?? 'Invalid query parameters.' });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  let request = supabase
    .from('attendance_summaries')
    .select('scope_type, scope_id, term_id, school_days, present_days, pct, computed_at')
    .eq('term_id', query.term_id);
  if (query.scope_type) request = request.eq('scope_type', query.scope_type);

  const { data, error } = await request;
  if (error) return dbErrorToResponse(error);

  const csv = toCsv(data ?? []);
  const path = `${crypto.randomUUID()}.csv`;

  const { error: uploadError } = await supabase.storage.from('exports').upload(path, new Blob([csv], { type: 'text/csv' }), {
    contentType: 'text/csv',
  });
  if (uploadError) return dbErrorToResponse(uploadError);

  const { data: signed, error: signError } = await supabase.storage.from('exports').createSignedUrl(path, 3600);
  if (signError || !signed) return dbErrorToResponse(signError ?? new Error('Could not create signed URL'));

  return jsonResponse({ url: signed.signedUrl, row_count: data?.length ?? 0 });
});
