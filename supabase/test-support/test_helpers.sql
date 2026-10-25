-- =============================================================================
-- LOCAL TESTS ONLY — NEVER APPLY TO SUPABASE.
-- Plain-SQL assertion helpers and fixtures for tests/db/*.sql (no pgTAP).
-- Applied by scripts/test-db.sh after migrations and seed.sql.
--
-- Pattern in a test file:
--   begin;
--   select tests.setup();                      -- users, profiles, clients
--   select tests.login('ta');                  -- JWT of therapist A (aal2)
--   set local role authenticated;              -- act as that user (RLS on)
--   do $$ begin perform tests.assert_eq(...); end $$;
--   reset role;
--   rollback;
-- =============================================================================

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- ------------------------------------------------------------- assertions --
create or replace function tests.ok(p_msg text) returns void language plpgsql as $$
begin
  raise notice 'ok - %', p_msg;
end;
$$;

create or replace function tests.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAILED: %', p_msg;
  end if;
  perform tests.ok(p_msg);
end;
$$;

create or replace function tests.assert_eq(p_actual anyelement, p_expected anyelement, p_msg text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAILED: % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
  perform tests.ok(p_msg);
end;
$$;

-- Runs p_sql and requires it to fail with p_sqlstate (and, optionally, a
-- message matching p_like). The failed statement is rolled back.
create or replace function tests.assert_raises(p_sql text, p_sqlstate text, p_msg text, p_like text default null)
returns void language plpgsql as $$
declare
  v_state text;
  v_text  text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
  end;
  if v_state is null then
    raise exception 'FAILED: % (expected error %, but statement succeeded)', p_msg, p_sqlstate;
  end if;
  if v_state <> p_sqlstate then
    raise exception 'FAILED: % (expected error %, got %: %)', p_msg, p_sqlstate, v_state, v_text;
  end if;
  if p_like is not null and v_text not like p_like then
    raise exception 'FAILED: % (error text "%" does not match "%")', p_msg, v_text, p_like;
  end if;
  perform tests.ok(p_msg);
end;
$$;

-- Number of rows an UPDATE/DELETE statement affected (to prove RLS hides rows).
create or replace function tests.affected(p_sql text) returns integer language plpgsql as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- --------------------------------------------------------------- fixtures --
-- Seeded test therapists (supabase/seed.sql)
create or replace function tests.therapist(p_code text) returns uuid language sql immutable as $$
  select case upper(p_code)
    when 'A' then '00000000-0000-4000-8000-0000000000a1'::uuid
    when 'B' then '00000000-0000-4000-8000-0000000000a2'::uuid
    when 'C' then '00000000-0000-4000-8000-0000000000a3'::uuid
  end;
$$;

-- Seeded session types: A60, A90 (therapist A), B60 (B), C90 (C)
create or replace function tests.session_type(p_code text) returns uuid language sql immutable as $$
  select case upper(p_code)
    when 'A60' then '00000000-0000-4000-8000-0000000000c1'::uuid
    when 'A90' then '00000000-0000-4000-8000-0000000000c2'::uuid
    when 'B60' then '00000000-0000-4000-8000-0000000000c3'::uuid
    when 'C90' then '00000000-0000-4000-8000-0000000000c4'::uuid
  end;
$$;

-- Auth users created by tests.setup()
create or replace function tests.uid(p_name text) returns uuid language sql immutable as $$
  select case p_name
    when 'admin'   then '10000000-0000-4000-8000-000000000001'::uuid
    when 'ta'      then '10000000-0000-4000-8000-000000000002'::uuid
    when 'tb'      then '10000000-0000-4000-8000-000000000003'::uuid
    when 'tc'      then '10000000-0000-4000-8000-000000000004'::uuid
    when 'client1' then '10000000-0000-4000-8000-000000000005'::uuid
    when 'client2' then '10000000-0000-4000-8000-000000000006'::uuid
  end;
$$;

-- Client rows created by tests.setup(): 1 = account of client1, 2 = account of
-- client2, 3 = guest entered by therapist B (manual booking).
create or replace function tests.client(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000000d' || p_n)::uuid;
$$;

create or replace function tests.room(p_number integer) returns uuid language sql stable as $$
  select id from public.rooms where number = p_number;
$$;

-- Creates fake users, links therapist A/B/C profiles, creates clients 1-3.
create or replace function tests.setup() returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_app_meta_data) values
    (tests.uid('admin'),   'admin@test.invalid',   '{"role":"admin"}'),
    (tests.uid('ta'),      'ta@test.invalid',      '{"role":"therapist"}'),
    (tests.uid('tb'),      'tb@test.invalid',      '{"role":"therapist"}'),
    (tests.uid('tc'),      'tc@test.invalid',      '{"role":"therapist"}'),
    (tests.uid('client1'), 'client1@test.invalid', '{}'),
    (tests.uid('client2'), 'client2@test.invalid', '{}');

  update public.therapists t set profile_id = p.id
    from public.profiles p
   where (t.id, p.user_id) in ((tests.therapist('A'), tests.uid('ta')),
                               (tests.therapist('B'), tests.uid('tb')),
                               (tests.therapist('C'), tests.uid('tc')));

  insert into public.clients (id, profile_id, created_by_therapist_id, first_name, last_name, email)
  values
    (tests.client(1), (select id from public.profiles where user_id = tests.uid('client1')), null,
     'Testcliënt', 'Een', 'client1@test.invalid'),
    (tests.client(2), (select id from public.profiles where user_id = tests.uid('client2')), null,
     'Testcliënt', 'Twee', 'client2@test.invalid'),
    (tests.client(3), null, tests.therapist('B'), 'Gast', 'Drie', null);
end;
$$;

-- "Log in" as a fixture user for the rest of the transaction (use with SET LOCAL ROLE).
-- p_aal: 'aal2' = passed TOTP (default, needed by admin/therapist, D17); 'aal1' = magic link only.
create or replace function tests.login(p_name text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(tests.uid(p_name)::text, ''), true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', tests.uid(p_name), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Reserve a block (as superuser, so no therapist guard).
create or replace function tests.block(p_therapist uuid, p_room integer, p_from timestamptz, p_to timestamptz)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.room_blocks (room_id, therapist_id, period)
  values (tests.room(p_room), p_therapist, tstzrange(p_from, p_to, '[)'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Book an appointment; period/snapshot are filled by the triggers.
create or replace function tests.book(
  p_therapist uuid, p_room integer, p_session_type uuid, p_start timestamptz,
  p_client uuid default '00000000-0000-4000-8000-0000000000d1',
  p_status text default 'confirmed', p_source text default 'online')
returns uuid language plpgsql as $$
declare
  v_duration integer;
  v_id uuid;
begin
  select duration_min into v_duration from public.session_types where id = p_session_type;
  insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period,
                                   status, hold_expires_at, source)
  values (p_therapist, tests.room(p_room), p_client, p_session_type,
          tstzrange(p_start, p_start + make_interval(mins => v_duration), '[)'),
          p_status, case when p_status = 'held' then now() + interval '15 minutes' end, p_source)
  returning id into v_id;
  return v_id;
end;
$$;

-- Draft invoice with one line, for invoice tests.
create or replace function tests.draft_invoice(
  p_seller uuid, p_appointment uuid, p_client uuid, p_amount_cents integer default 2000, p_kind text default 'deposit')
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.invoices (seller_type, seller_therapist_id, kind, appointment_id, buyer_client_id)
  values ('therapist', p_seller, p_kind, p_appointment, p_client)
  returning id into v_id;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_cents, line_total_cents,
                                    btw_treatment, btw_rate_bp, btw_cents, exemption_ground)
  values (v_id, 'Aanbetaling / Deposit', 1, p_amount_cents, p_amount_cents, 'exempt', 0, 0, 'test ground');
  return v_id;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
