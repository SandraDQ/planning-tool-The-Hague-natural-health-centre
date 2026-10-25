-- =============================================================================
-- THNHC platform · 0001 foundation
-- Extensions and small shared helpers used by every later migration.
--
-- Error codes raised by THNHC triggers/functions (SQLSTATE, for the app layer):
--   TH001  appointment in a shared room is not inside a reserved block of that therapist
--   TH002  appointment in a private room that is not assigned to that therapist
--   TH003  issued invoice (or its lines) cannot be changed or deleted
--   TH004  change would leave held/confirmed appointments outside their block / room
--   TH005  column may only be changed by admin or by the server (service role)
--   TH006  invalid room for this action (e.g. block in a private or inactive room)
--   TH007  paper-calendar window not available
--   TH008  catalogue mismatch (session type / service does not belong to therapist)
--   TH009  therapists cannot create or change blocks that have already started
--   TH010  money rule violated (e.g. refunds exceed the payment)
--   23P01  (Postgres) exclusion constraint: overlap with another block / appointment
-- =============================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Keeps updated_at current. Attached to every table in the RLS migration.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the statement does NOT come from an end user (anon / authenticated):
-- the service role used by the server, migrations, pg_cron, or a SECURITY DEFINER
-- function owned by the migration role. Used by guard triggers.
create or replace function public.is_privileged_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated');
$$;
