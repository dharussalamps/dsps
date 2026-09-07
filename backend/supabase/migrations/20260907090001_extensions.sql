-- Extensions required by later migrations.
-- pgcrypto: gen_random_uuid() used as the default for every primary key.
create extension if not exists pgcrypto;
-- btree_gist: needed for the exclusion constraint that stops terms overlapping.
create extension if not exists btree_gist;
-- pg_cron: scheduled jobs (section 7 / build task 11). If this fails on a
-- hosted Supabase project, enable "pg_cron" from Database > Extensions in
-- the dashboard first, then re-run this migration.
create extension if not exists pg_cron;
