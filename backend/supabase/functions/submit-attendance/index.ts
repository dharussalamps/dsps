// AdminSpec.md section 8: POST /submit-attendance
// Accepts { class_id, on_date, entries[], device_id, client_submission_id }.
// Idempotent on client_submission_id. Writes attendance_submissions +
// student_attendance in one transaction (via the submit_attendance()
// Postgres function — see backend/supabase/migrations/
// ..._submit_attendance.sql), returns an absentee summary with
// consecutive-day counts.
//
// This function does not use the service role: it forwards the caller's
// own Authorization header, so every write still goes through their RLS
// policies (section 2: "no business logic in the client" cuts both ways —
// the Edge Function doesn't get to bypass permission checks either).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsPreflightResponse, dbErrorToResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

// Kept structurally identical to apps/admin/src/features/attendance/schema.ts
// by hand — see docs/AdminSpec.md section 17 for why this isn't a single
// shared file (Metro and Deno don't share a module resolution story here).
const payloadSchema = z.object({
  class_id: z.string().uuid(),
  on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'on_date must be YYYY-MM-DD'),
  entries: z
    .array(
      z.object({
        student_id: z.string().uuid(),
        status: z.enum(['present', 'absent', 'late']),
        reason: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .min(1, 'entries must not be empty'),
  device_id: z.string().max(200).optional(),
  client_submission_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();
  if (req.method !== 'POST') {
    return errorResponse(405, { code: 'method_not_allowed', message: 'Use POST.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse(401, { code: 'unauthenticated', message: 'Missing Authorization header.' });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0] : undefined;
    return errorResponse(400, {
      code: 'invalid_payload',
      message: issue?.message ?? 'Invalid request body.',
      field: issue?.path?.join('.'),
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(401, { code: 'unauthenticated', message: 'Invalid or expired session.' });
  }

  const { data: submissionId, error: submitError } = await supabase.rpc('submit_attendance', {
    p_class_id: payload.class_id,
    p_on_date: payload.on_date,
    p_entries: payload.entries,
    p_device_id: payload.device_id ?? null,
    p_client_submission_id: payload.client_submission_id,
  });

  if (submitError) return dbErrorToResponse(submitError);

  const absenteeIds = payload.entries.filter((e) => e.status === 'absent').map((e) => e.student_id);

  let absentees: { student_id: string; full_name: string; consecutive_absences: number }[] = [];
  if (absenteeIds.length > 0) {
    const { data: students } = await supabase.from('students').select('id, full_name').in('id', absenteeIds);

    absentees = await Promise.all(
      (students ?? []).map(async (s: { id: string; full_name: string }) => {
        const { data: count } = await supabase.rpc('consecutive_absences', {
          p_student: s.id,
          p_as_of: payload.on_date,
        });
        return { student_id: s.id, full_name: s.full_name, consecutive_absences: (count as number) ?? 0 };
      }),
    );
  }

  return jsonResponse({ submission_id: submissionId, absentees });
});
