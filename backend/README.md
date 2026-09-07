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

## Status

Not yet executed in this repository's build environment — no Supabase CLI
or Docker were available. Migrations, seed files and tests are believed
correct by review against `docs/AdminSpec.md`, but have not been run
against a live Postgres instance. Run the commands above before trusting
this in production. See `docs/AdminSpec.md` section 17 for what's been
built so far.
