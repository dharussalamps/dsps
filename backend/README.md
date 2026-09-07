# Backend (Supabase)

This is a Supabase CLI project. Everything the CLI needs lives under
`supabase/` (config, migrations, Edge Functions, seed data, pgTAP tests) —
see `docs/AdminSpec.md` section 3 and section 4 onward for what each piece
implements and why.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` or `brew install supabase/tap/supabase`)
- Docker Desktop running (the CLI runs Postgres, GoTrue, PostgREST etc. locally in containers)

## First-time setup

```sh
cd backend
supabase start          # boots the local stack; prints your local URL + anon/service keys
supabase db reset        # applies every migration in supabase/migrations, then every
                          # file in supabase/seed (in filename order)
```

`supabase db reset` is the command to re-run any time you change a
migration or seed file during development — it drops and rebuilds the local
database from scratch, so it's always safe on a local/dev project.

Copy the printed `API URL` and `anon key` into `apps/admin/.env` (see
`apps/admin/.env.example`).

## Running the pgTAP tests

```sh
supabase test db
```

Runs everything under `supabase/tests`. Each file wraps its own fixtures in
`begin ... rollback`, so tests are independent of whatever seed data is
loaded and leave no trace.

## Deploying Edge Functions (once you have a hosted project)

```sh
supabase link --project-ref <your-project-ref>
supabase functions deploy <function-name>
```

## Pushing migrations to a hosted project

```sh
supabase db push
```

## Before going to production (build task 23: hardening)

A few things a migration can't do for you — treat this as a checklist for
whoever takes this to a real, hosted Supabase project:

- **Auth rate limits.** Supabase's OTP/sign-in rate limits are dashboard
  settings (Authentication → Rate Limits), not something a migration
  configures. The platform defaults are sane; review them for your
  expected staff count before launch. Application-level rate limiting for
  the functions this build added (announcements, manual attendance
  reminders) *is* implemented — see `check_rate_limit()` in
  `supabase/migrations/20260907220001_rate_limiting.sql`.
- **Backup/restore drill.** Not something this build environment could
  test (no live project). Once hosted: enable point-in-time recovery or
  scheduled backups in the Supabase dashboard, then actually restore into
  a scratch project and confirm the app can point at it — an untested
  backup is not a backup.
- **RLS coverage.** Verified in this repo: every table created by these
  migrations has `enable row level security` — see the `create table`
  vs. `enable row level security` counts, which match exactly (43/43) as
  of this writing. Keep that invariant as new tables are added; a table
  without RLS enabled is readable by anyone with the anon key.
- **Accessibility.** Tap targets go through `Button`/`Card`, both built to
  the 44dp minimum; `SyncStatusBadge`'s retry pill uses `hitSlop` to clear
  it despite a visually smaller footprint. Every `StatusPill` tone's text
  color was checked against its background for ≥4.5:1 contrast (WCAG AA);
  three (`success`, `warning`, `info`) were originally too light and were
  darkened — see the comment in `apps/admin/src/theme/tokens.ts`.

## Status

Not yet executed in this repository's build environment — no Supabase CLI
or Docker were available. Migrations, seed files and tests are believed
correct by review against `docs/AdminSpec.md`, but have not been run
against a live Postgres instance. Run the commands above before trusting
this in production. See `docs/AdminSpec.md` section 17 for what's been
built so far.
