// AdminSpec.md section 8, "Response conventions": errors are
// { error: { code, message, field? } } with a stable code and a
// user-presentable message — never a raw Postgres error. Shared by every
// Edge Function so the shape is consistent across the whole API surface.

export type ApiError = { code: string; message: string; field?: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, error: ApiError): Response {
  return jsonResponse({ error }, status);
}

export function corsPreflightResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}

/** Translates the small set of exceptions submit_attendance() and friends raise (by SQLSTATE) into API errors; anything else becomes a generic 500 rather than leaking a raw Postgres message. */
export function dbErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string })?.code;
  const message = (err as { message?: string })?.message ?? 'Unexpected error';

  if (code === 'P0001') {
    return errorResponse(403, { code: 'no_staff_record', message: 'No staff record is linked to this account.' });
  }
  if (code === 'P0002') {
    const conflictId = (err as { details?: string })?.details;
    return errorResponse(409, {
      code: 'already_submitted',
      message: 'This class has already been submitted for this date.',
      field: conflictId,
    });
  }
  if (code === '42501') {
    // Postgres RLS policy violation — the caller doesn't hold the required permission.
    return errorResponse(403, { code: 'forbidden', message: "You don't have permission to do this." });
  }

  console.error('Unhandled database error:', message);
  return errorResponse(500, { code: 'internal_error', message: 'Something went wrong. Please try again.' });
}
