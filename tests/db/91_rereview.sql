-- Phase 2 re-review (handoffs/reviews/phase2-review.md, "Re-review").
-- Tries to break the fixes in migration 0010 from angles the backend's own
-- tests (90_review) do not cover.
begin;
select tests.setup();
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
select tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');

create temporary table t_ids (k text primary key, id uuid);
grant select on t_ids to anon, authenticated, service_role;
insert into t_ids values
  ('apptA', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(1))),
  ('apptB', tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(2))),
  ('heldA', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(2), 'held'));
insert into public.intakes (appointment_id, answers, health_data_consent_at)
select id, '{"reason": "fictional complaint"}'::jsonb, now() from t_ids where k in ('apptA', 'apptB', 'heldA');
insert into t_ids select 'intake_' || a.k, i.id from public.intakes i join t_ids a on a.id = i.appointment_id;
select public.issue_invoice(tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'apptA'), tests.client(1)));
insert into public.payments (appointment_id, mollie_payment_id, amount_cents, status)
select id, 'tr_rr_' || k, 2000, 'paid' from t_ids where k = 'apptA';

-- ======================================================== F1: other paths ==
select tests.login('admin');
set local role authenticated;
do $$
declare
  v_client_profile uuid;
begin
  perform tests.assert_raises(
    'insert into public.clients (first_name, last_name, profile_id) values (''A'', ''B'', public.current_profile_id())',
    'TH005', 'F1: admin cannot create a client row linked to own profile');
  select p.id into v_client_profile from public.profiles p where p.user_id = tests.uid('client2');
  perform tests.assert_raises(
    format('insert into public.clients (first_name, last_name, profile_id) values (''A'', ''B'', %L)', v_client_profile),
    'TH005', 'F1: admin cannot create a second client row for an existing client account');
  perform tests.assert_raises(
    format('update public.appointments set client_id = %L where id = %L', tests.client(3), (select id from t_ids where k = 'heldA')),
    'TH005', 'F1: admin cannot re-point an appointment to another client');
  perform tests.assert_raises(
    format('update public.appointments set therapist_id = %L where id = %L', tests.therapist('B'), (select id from t_ids where k = 'apptA')),
    'TH005', 'F1: admin cannot re-point an appointment to another therapist');
  perform tests.assert_eq(public.current_client_ids(), '{}'::uuid[], 'F1: admin never owns client rows (current_client_ids empty)');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 0, 'F1: admin (aal2) sees no intake rows');
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from t_ids where k = 'intake_apptA')),
    '42501', 'F1: admin cannot read intake content via read_intake()');
  perform tests.assert_raises(format('select public.log_intake_access(%L)', (select id from t_ids where k = 'intake_apptA')),
    '42501', 'F1: admin cannot use log_intake_access() as an oracle');
  perform tests.assert_eq(tests.affected('delete from public.profiles'), 0, 'F3: admin cannot delete profiles');
  perform tests.assert(
    (select count(*) from public.profiles) = 6, 'F3: admin can still read all profiles');
end;
$$;
do $$
declare
  v_state text;
begin
  begin
    execute format('insert into public.profiles (user_id, role) values (%L, %L)', gen_random_uuid(), 'admin');
  exception when others then
    v_state := sqlstate;
  end;
  perform tests.assert(v_state in ('TH005', '42501', '23503'), 'F3: admin cannot insert profiles (got ' || coalesce(v_state, 'success') || ')');
end;
$$;
reset role;

-- even the server cannot link a client row to an admin or therapist profile
do $$
begin
  perform tests.assert_raises(
    format('insert into public.clients (first_name, last_name, profile_id) values (''A'', ''B'', %L)',
           (select id from public.profiles where user_id = tests.uid('admin'))),
    'TH005', 'F1: server cannot link a client row to an admin profile');
  perform tests.assert_raises(
    format('insert into public.clients (first_name, last_name, profile_id) values (''A'', ''B'', %L)',
           (select id from public.profiles where user_id = tests.uid('ta'))),
    'TH005', 'F1: server cannot link a client row to a therapist profile');
end;
$$;

-- therapist and client cannot create linked client rows either
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    'insert into public.clients (first_name, last_name, profile_id) values (''A'', ''B'', public.current_profile_id())',
    'TH005', 'F1: therapist cannot link a client row to own profile');
  -- F8: intake content of own patients only via read_intake (logged)
  perform tests.assert_raises('select answers from public.intakes', '42501', 'F8: therapist cannot select answers directly');
  perform tests.assert_raises('update public.intakes set delete_after = delete_after where answers ? ''reason''',
    '42501', 'F8: no unlogged read of answers through a WHERE clause');
  perform tests.assert_raises('update public.intakes set delete_after = delete_after returning answers',
    '42501', 'F8: no unlogged read of answers through RETURNING');
  perform tests.assert_raises(
    'update public.intakes set answers = jsonb_build_object(''copy'', answers)',
    '42501', 'F8: no unlogged read of answers through a SET expression');
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from t_ids where k = 'intake_apptB')),
    '42501', 'F1: therapist A cannot read therapist B''s intake via read_intake()');
  perform tests.assert_eq((public.read_intake((select id from t_ids where k = 'intake_apptA'))).answers ->> 'reason',
    'fictional complaint', 'F8: treating therapist (aal2) reads own intake via read_intake()');
  perform tests.assert_eq((select count(*)::integer from public.intake_access_log
                            where intake_id = (select id from t_ids where k = 'intake_apptA')), 1,
    'F8: read_intake() wrote the access log');
end;
$$;
reset role;
select tests.login('client1', 'aal1');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('insert into public.clients (first_name, last_name) values (''A'', ''B'')',
    '42501', 'F1: client cannot insert client rows through the API');
  perform tests.assert_eq((public.read_intake((select id from t_ids where k = 'intake_apptA'))).answers ->> 'reason',
    'fictional complaint', 'client (aal1) reads own intake via read_intake()');
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from t_ids where k = 'intake_apptB')),
    '42501', 'client cannot read another client''s intake');
end;
$$;
reset role;

-- ===================================== F2: aal1 sees and changes nothing ===
-- Every table, every role that needs 2FA, at aal1 and without any aal claim.
create or replace function pg_temp.visible_rows() returns table (tbl text, n bigint) language plpgsql as $$
declare
  t text;
begin
  for t in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
            where ns.nspname = 'public' and c.relkind = 'r' order by 1 loop
    tbl := t;
    begin
      execute format('select count(id) from public.%I', t) into n;
    exception when insufficient_privilege then
      n := 0;
    end;
    return next;
  end loop;
end;
$$;
grant execute on function pg_temp.visible_rows() to authenticated;

do $$
begin
  perform tests.ok('F2 setup');
end;
$$;

select tests.login('ta', 'aal1');
set local role authenticated;
do $$
declare
  v_bad text;
begin
  select string_agg(tbl || '=' || n, ', ') into v_bad from pg_temp.visible_rows()
   where n > 0 and not (tbl = 'profiles' and n = 1)
     and tbl not in ('therapies', 'services', 'session_types', 'therapists');
  perform tests.assert(v_bad is null, 'F2: therapist at aal1 sees no private rows in any table (' || coalesce(v_bad, 'none') || ')');
  perform tests.assert_eq(tests.affected('update public.therapists set bio_en = ''x'' where id = public.current_therapist_id()'), 0,
    'F2: therapist at aal1 cannot update own settings');
  -- refused either by RLS (42501) or earlier by the guard trigger, which at aal1
  -- cannot see the block templates (TH006): both mean "no write"
  declare
    v_state text;
  begin
    begin
      insert into public.room_blocks (room_id, therapist_id, period)
      values (tests.room(5), public.current_therapist_id(),
              tstzrange('2027-04-05 08:00 Europe/Amsterdam', '2027-04-05 12:00 Europe/Amsterdam', '[)'));
    exception when others then
      v_state := sqlstate;
    end;
    perform tests.assert(v_state in ('42501', 'TH006'),
      'F2: therapist at aal1 cannot reserve a block (got ' || coalesce(v_state, 'success') || ')');
  end;
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from t_ids where k = 'intake_apptA')),
    '42501', 'F2: therapist at aal1 cannot read own intake via read_intake()');
  perform tests.assert_raises(format('select public.log_intake_access(%L)', (select id from t_ids where k = 'intake_apptA')),
    '42501', 'F2: therapist at aal1 cannot log intake access');
end;
$$;
reset role;

-- public catalogue tables are still readable at aal1 (public data), but only public rows
select tests.login('admin', 'aal1');
set local role authenticated;
do $$
declare
  v_bad text;
begin
  select string_agg(tbl || '=' || n, ', ') into v_bad from pg_temp.visible_rows()
   where n > 0 and not (tbl = 'profiles' and n = 1)
     and tbl not in ('therapies', 'services', 'session_types', 'therapists');
  perform tests.assert(v_bad is null, 'F2: admin at aal1 sees no private rows in any table (' || coalesce(v_bad, 'none') || ')');
  perform tests.assert_eq((select count(*)::integer from public.therapists), 0,
    'F2: admin at aal1 does not even see public therapist rows (restrictive policy)');
  perform tests.assert_raises('select * from public.job_health()', '42501', 'F2: job_health() refuses admin at aal1');
  perform tests.assert_eq(tests.affected('update public.rooms set name = ''x'''), 0, 'F2: admin at aal1 cannot change rooms');
end;
$$;
reset role;

-- a JWT without any aal claim counts as aal1
select set_config('request.jwt.claim.sub', tests.uid('admin')::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', tests.uid('admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform tests.assert_eq(public.mfa_satisfied(), false, 'F2: admin JWT without aal claim is not MFA-satisfied');
  perform tests.assert_eq((select count(*)::integer from public.appointments), 0, 'F2: ...and sees no appointments');
end;
$$;
reset role;

select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.job_health()), 2, 'F4: job_health() answers admin at aal2');
end;
$$;
reset role;
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('select * from public.job_health()', '42501', 'F4: job_health() refuses therapists');
end;
$$;
reset role;

-- every table carries the restrictive require_mfa policy for authenticated
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (not c.relrowsecurity
          or not exists (select 1 from pg_policy p
                          where p.polrelid = c.oid and not p.polpermissive
                            and p.polroles @> array['authenticated'::regrole::oid]
                            and pg_get_expr(p.polqual, p.polrelid) like '%mfa_satisfied%'));
  perform tests.assert(v_missing is null, 'F2: RLS + restrictive require_mfa on every table (missing: ' || coalesce(v_missing, 'none') || ')');
  perform tests.assert_eq(
    (select count(*)::integer from pg_views where schemaname = 'public')
    + (select count(*)::integer from pg_matviews where schemaname = 'public'), 0,
    'F2: no views in public that could bypass RLS');
end;
$$;

-- SECURITY DEFINER functions callable by end users: exact allow-list
do $$
declare
  v_extra text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_extra
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('current_profile_id', 'auth_role', 'is_admin', 'current_therapist_id', 'current_client_ids',
                           'is_bookable_therapist', 'is_public_service', 'owns_service', 'therapist_can_use_client',
                           'mfa_satisfied', 'read_intake', 'log_intake_access', 'job_health');
  perform tests.assert(v_extra is null, 'F2/F6: no unexpected SECURITY DEFINER function for authenticated (' || coalesce(v_extra, 'none') || ')');
  perform tests.assert(not has_function_privilege('authenticated', 'public.purge_expired_intakes()', 'execute')
                   and not has_function_privilege('authenticated', 'public.issue_invoice(uuid)', 'execute')
                   and not has_function_privilege('authenticated', 'public.expire_stale_holds(uuid)', 'execute'),
    'F6: server-only functions stay server-only');
end;
$$;

-- ============================================================ F6: anon ====
do $$
declare
  v_tables text;
  v_funcs  text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
     and c.relname not in ('therapies', 'services', 'session_types', 'therapists');
  perform tests.assert(v_tables is null, 'F6: anon has privileges only on the public catalogue (extra: ' || coalesce(v_tables, 'none') || ')');
  perform tests.assert(not has_table_privilege('anon', 'public.therapists', 'select')
                   and not has_column_privilege('anon', 'public.therapists', 'profile_id', 'select')
                   and not has_column_privilege('anon', 'public.therapists', 'intake_retention_days', 'select'),
    'F6: anon reads only the public therapist columns');
  perform tests.assert(not has_table_privilege('anon', 'public.services', 'insert,update,delete'),
    'F6: anon cannot write the catalogue');

  select string_agg(p.proname, ', ' order by p.proname) into v_funcs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('is_bookable_therapist', 'is_public_service');
  perform tests.assert(v_funcs is null, 'F6: anon can execute only the two catalogue helpers (extra: ' || coalesce(v_funcs, 'none') || ')');

  perform tests.assert(not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (has_table_privilege('authenticated', c.oid, 'truncate,references,trigger')
              or has_table_privilege('anon', c.oid, 'truncate'))),
    'F10: no TRUNCATE/REFERENCES/TRIGGER for anon or authenticated on any table');

  -- objects created later by the migration role get no automatic grants
  create table public.rr_probe (id int);
  create function public.rr_probe_fn() returns int language sql as 'select 1';
  perform tests.assert(not has_table_privilege('anon', 'public.rr_probe', 'select,insert,update,delete')
                   and not has_table_privilege('authenticated', 'public.rr_probe', 'select,insert,update,delete'),
    'F6: a new table is not granted to anon/authenticated');
  perform tests.assert(not has_function_privilege('anon', 'public.rr_probe_fn()', 'execute')
                   and not has_function_privilege('authenticated', 'public.rr_probe_fn()', 'execute'),
    'F6: a new function is not executable by PUBLIC/anon/authenticated');
  drop function public.rr_probe_fn();
  drop table public.rr_probe;
end;
$$;

set local role anon;
do $$
begin
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from t_ids where k = 'intake_apptA')),
    '42501', 'F6: anon cannot call read_intake()');
  perform tests.assert_raises('select * from public.job_health()', '42501', 'F6: anon cannot call job_health()');
  perform tests.assert_raises('select public.mfa_satisfied()', '42501', 'F6: anon cannot call mfa_satisfied()');
end;
$$;
reset role;

-- ================================================== F5 + F7: retention ====
-- expired hold (via the job) → intake due now → purge deletes it, logged once
update public.appointments set hold_expires_at = now() - interval '1 minute' where id = (select id from t_ids where k = 'heldA');
do $$
declare
  v_intake uuid := (select id from t_ids where k = 'intake_heldA');
  v_purged integer;
begin
  perform public.expire_stale_holds();
  perform tests.assert((select delete_after <= now() from public.intakes where id = v_intake),
    'F5: expired hold makes its intake due at once');
  perform tests.assert_eq((select delete_after > now() from public.intakes where id = (select id from t_ids where k = 'intake_apptA')), true,
    'F5: intakes of live bookings keep their retention date');
  v_purged := public.purge_expired_intakes();
  perform tests.assert_eq(v_purged, 1, 'F5: purge removes exactly the due intake');
  perform tests.assert_eq((select array_agg(reason) from public.deletion_log where entity_id = v_intake), array['retention_expired'],
    'F7: purge logs exactly one retention_expired row (no duplicate manual row)');
  perform tests.assert_eq((select count(*)::integer from public.invoices where status = 'issued'), 1, 'F5: invoices untouched');
  perform tests.assert_eq((select count(*)::integer from public.payments), 1, 'F5: payments untouched');
end;
$$;

-- manual deletion cannot be disguised as retention, whatever the session says
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform set_config('thnhc.deletion_reason', 'retention_expired', true);
  perform tests.assert_eq(tests.affected(format('delete from public.intakes where id = %L', (select id from t_ids where k = 'intake_apptA'))), 1,
    'F7: treating therapist deletes an intake manually');
end;
$$;
reset role;
do $$
begin
  perform tests.assert_eq(
    (select array_agg(reason) from public.deletion_log where entity_id = (select id from t_ids where k = 'intake_apptA')),
    array['manual'], 'F7: manual deletion is logged as manual despite the session setting');
end;
$$;

-- F9: onboarding_status is admin/server-only
select tests.login('tc');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('update public.therapists set onboarding_status = ''complete'' where id = public.current_therapist_id()',
    'TH005', 'F9: therapist cannot mark own onboarding complete');
end;
$$;
reset role;

rollback;
