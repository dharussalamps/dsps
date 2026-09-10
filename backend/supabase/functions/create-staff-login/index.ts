// Closes the scope gap noted in docs/AdminSpec.md build task 21 / "Known
// deviations": issuing a login (an auth.users row) needs Supabase's admin
// API, callable only with the service role — never from the mobile app's
// own anon-key client, and never safely from a client-supplied service key
// either. This is exactly the "requires privileged work" case section 8's
// own rule carves out for an Edge Function, so it's a 9th one beyond the
// spec's listed 8, deliberate rather than an oversight.
//
// Body: { staff_id: uuid }. Uses the caller's own Authorization header to
// resolve current_staff_id() and check staff.manage/account.manage — the
// same OR the write_staff RLS policy already uses (see
// 20260907200001_accounts.sql) — before ever touching the service-role
// client, so this can't be used to provision a login without the same
// permission the in-app "Create" button already requires.
//
// Login channel: email, not phone. This build originally used phone (see
// git history / AdminSpec.md build task 3's original reasoning: staff.phone
// is required, staff.email is optional, so phone was the channel guaranteed
// to exist). Reversed once real SMS pricing was checked: every Supabase SMS
// provider is pay-per-message with no free tier, and delivering to Sri
// Lankan numbers (+94) specifically runs to roughly $0.40/SMS on Twilio —
// prohibitive for a school with no ongoing SMS budget. Supabase's own
// transactional email is free, so email is now required specifically for
// this action (not at the schema level — staff.email stays nullable, so
// existing/newly created staff without one on file simply can't get a
// login until an email is added via the Edit action on their account
// card).
//
// Resend/reset: if staff.auth_user_id is already set, this no longer 409s —
// it generates a *new* temp password and overwrites the existing
// auth.users row's password via admin.updateUserById (re-setting
// needs_password_set = true), rather than creating a second account. This
// is what "the staff member never got the email, resend it" and "they're
// locked out, issue them a fresh login" both need: the original temp
// password is never stored anywhere (by design — it only ever lived in the
// single API response), so there is nothing to literally resend, only a
// fresh one to issue in its place.
//
// First sign-in: a random temporary password, not the "Forgot password"
// OTP flow. Originally this created a passwordless account and relied on
// OTP-by-email for first sign-in too — but that makes the very first login
// depend on the project's email OTP template being configured correctly,
// on top of the "Forgot password" flow this app already needs anyway for
// later resets. A temp password lets the principal hand it to the staff
// member directly and skip that dependency for onboarding: they sign in
// normally (SignInForm, email + this password) and, because
// user_metadata.needs_password_set = true (the same convention
// authStore.ts/SetPasswordScreen already implement), RootNavigator routes
// them straight to SetPasswordScreen before they can do anything else — no
// "Forgot password" tap required. That flow remains for genuine later
// resets.
//
// Emailing the temp password: Supabase's own mailer only sends its own
// fixed auth templates (confirmation/magic-link/invite/reset) — there's no
// API to send arbitrary content through it. Originally called Resend's
// REST API, but every transactional email provider (Resend included)
// requires verifying a domain you control before it will deliver to
// arbitrary recipients — and this school has no domain at all, not even an
// unverified one. Switched to sending via Gmail's own SMTP server instead:
// Gmail's domain is already established/trusted, so no domain of our own
// is needed, and it's free (a personal Gmail account's send limit is
// ~500/day, far beyond what a small school needs). Requires two secrets on
// this project — GMAIL_USER (the sending Gmail address) and
// GMAIL_APP_PASSWORD (a 16-character App Password from that Google
// account's Security settings; a regular account password won't work,
// Google requires 2-Step Verification + an App Password for SMTP access).
// Missing/failed email send never fails account creation — the temp
// password is still returned in the response so the principal's in-app
// alert is always a working fallback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsPreflightResponse, dbErrorToResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const bodySchema = z.object({
  staff_id: z.string().uuid(),
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Excludes visually-ambiguous characters (0/O, 1/I/l) since the principal
// reads this out or types it to relay to the staff member by hand.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateTempPassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length]).join('');
}

async function sendTempPasswordEmail(to: string, fullName: string, temporaryPassword: string): Promise<boolean> {
  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!gmailUser || !gmailAppPassword) return false;

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailAppPassword },
    },
  });

  try {
    await client.send({
      from: gmailUser,
      to,
      subject: 'Your DSPS Office app login',
      content: `Hi ${fullName},

An account has been created for you in the DSPS Office app.

Email: ${to}
Temporary password: ${temporaryPassword}

Open the app and sign in with these details — you'll be asked to choose your own password immediately after.

If you weren't expecting this, contact your school administrator.`,
    });
    return true;
  } catch (err) {
    console.error('Gmail SMTP send failed:', err);
    return false;
  } finally {
    // A throw here (e.g. the connection never opened) must never escape —
    // that would turn a graceful "email failed" into a 500 for the whole
    // request, even though the login itself was already created/reset.
    try {
      await client.close();
    } catch (closeErr) {
      console.error('SMTP client close failed:', closeErr);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();
  if (req.method !== 'POST') return errorResponse(405, { code: 'method_not_allowed', message: 'Use POST.' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse(401, { code: 'unauthenticated', message: 'Missing Authorization header.' });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0] : undefined;
    return errorResponse(400, { code: 'invalid_payload', message: issue?.message ?? 'Invalid request body.' });
  }

  const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: callerStaffId, error: callerError } = await authed.rpc('current_staff_id');
  if (callerError) return dbErrorToResponse(callerError);
  if (!callerStaffId) return errorResponse(403, { code: 'no_staff_record', message: 'No staff record is linked to this account.' });

  const [{ data: canManageAccounts }, { data: canManageStaff }] = await Promise.all([
    authed.rpc('has_permission', { p_staff_id: callerStaffId, p_permission: 'account.manage' }),
    authed.rpc('has_permission', { p_staff_id: callerStaffId, p_permission: 'staff.manage' }),
  ]);
  if (!canManageAccounts && !canManageStaff) {
    return errorResponse(403, { code: 'forbidden', message: "You don't have permission to do this." });
  }

  const { data: staff, error: staffError } = await authed
    .from('staff')
    .select('id, full_name, email, auth_user_id')
    .eq('id', body.staff_id)
    .maybeSingle();
  if (staffError) return dbErrorToResponse(staffError);
  if (!staff) return errorResponse(404, { code: 'not_found', message: 'Staff member not found.' });

  const email = staff.email?.trim();
  if (!email || !emailPattern.test(email)) {
    return errorResponse(400, {
      code: 'missing_email',
      message: `${staff.full_name} needs a valid email on file before a login can be created. Add one via Edit first.`,
      field: 'email',
    });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const temporaryPassword = generateTempPassword();
  const isResend = !!staff.auth_user_id;
  let authUserId: string;

  if (isResend) {
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(staff.auth_user_id!, {
      password: temporaryPassword,
      email,
      email_confirm: true,
      user_metadata: { needs_password_set: true, staff_id: staff.id },
    });
    if (updateError) {
      console.error('Failed to reset existing login:', updateError);
      return errorResponse(500, { code: 'internal_error', message: 'Could not issue a new login. Please try again.' });
    }
    authUserId = updated.user.id;
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { needs_password_set: true, staff_id: staff.id },
    });
    if (createError) {
      const alreadyRegistered = /already been registered|already exists/i.test(createError.message);
      return errorResponse(alreadyRegistered ? 409 : 500, {
        code: alreadyRegistered ? 'email_already_registered' : 'internal_error',
        message: alreadyRegistered ? `${email} is already linked to a different login.` : 'Could not create a login. Please try again.',
      });
    }
    authUserId = created.user.id;

    const { error: linkError } = await admin.from('staff').update({ auth_user_id: authUserId }).eq('id', staff.id);
    if (linkError) {
      // The auth user now exists but isn't linked — leaving it unlinked
      // would silently break current_staff_id() for that user forever, so
      // this is reported as a real failure rather than swallowed; a retry
      // of this same endpoint now takes the isResend branch above (since
      // the auth user exists under this email, just not yet linked), which
      // won't re-link it either — clean-up is a manual (rare) admin step.
      console.error('Created auth user but failed to link staff.auth_user_id:', linkError);
      return errorResponse(500, { code: 'link_failed', message: 'Login was created but could not be linked. Contact support.' });
    }
  }

  const emailSent = await sendTempPasswordEmail(email, staff.full_name, temporaryPassword);

  return jsonResponse({ auth_user_id: authUserId, email, temporary_password: temporaryPassword, email_sent: emailSent, created: !isResend });
});
