-- =============================================================================
-- LOCAL TESTS ONLY — NEVER APPLY TO SUPABASE.
-- Minimal stand-in for what Supabase provides out of the box, so migrations
-- and RLS tests run on a plain Postgres 16 cluster (scripts/test-db.sh):
--   * roles anon, authenticated, service_role (service_role bypasses RLS)
--   * schema auth with auth.users, auth.uid(), auth.role(), auth.jwt()
--   * schema extensions
--   * Supabase's default privileges on schema public
-- auth.uid() reads request.jwt.claim.sub (or request.jwt.claims ->> 'sub'),
-- exactly like Supabase; auth.jwt() ->> 'aal' gives the MFA assurance level.
-- Tests "log in" with set_config(...) + SET ROLE (see tests.login()).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

-- Full claims from request.jwt.claims (as Supabase/PostgREST sets them). If
-- only single claims are set (request.jwt.claim.sub / .role / .aal), they are
-- assembled into an object, so tests can set the assurance level (aal1/aal2).
create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'sub',  nullif(current_setting('request.jwt.claim.sub', true), ''),
      'role', nullif(current_setting('request.jwt.claim.role', true), ''),
      'aal',  nullif(current_setting('request.jwt.claim.aal', true), '')))
  );
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Supabase defaults for objects created in public by the migration role.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
