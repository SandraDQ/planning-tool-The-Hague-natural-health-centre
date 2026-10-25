-- Phase 2 privacy/security review (handoffs/reviews/phase2-review.md).
-- Originally written by the reviewer with "HOLE:" assertions that passed while
-- each hole existed. After the fixes in migration 0010 every block now asserts
-- the FIXED behaviour (Rn FIXED). Disproved paths are kept as regression tests.
begin;
select tests.setup();
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');

create temporary table t_ids (k text primary key, id uuid);
grant select, insert on t_ids to anon, authenticated, service_role;
insert into t_ids values
  ('appt1', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(1))),
  ('appt2', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(2), 'held'));

-- ================================================== R1 admin → intake (F1) ==
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    $q$insert into public.clients (id, profile_id, first_name, last_name)
       values ('00000000-0000-4000-8000-0000000000e1', public.current_profile_id(), 'Admin', 'Als cliënt')$q$,
    'TH005', 'R1 FIXED: admin cannot create a client row linked to own profile');
  perform tests.assert_raises(
    format($q$insert into public.clients (first_name, last_name, profile_id)
              values ('x', 'y', (select id from public.profiles where user_id = %L))$q$, tests.uid('client2')),
    'TH005', 'R1 FIXED: admin cannot link a new client row to any account (server only)');
  insert into public.clients (id, first_name, last_name) values ('00000000-0000-4000-8000-0000000000e1', 'Admin', 'Als cliënt');
  perform tests.assert_raises(
    format('update public.appointments set client_id = %L where id = %L',
           '00000000-0000-4000-8000-0000000000e1', (select id from t_ids where k = 'appt2')),
    'TH005', 'R1 FIXED: admin cannot re-point an appointment to another client');
  perform tests.assert_raises(
    format('update public.appointments set therapist_id = %L where id = %L', tests.therapist('B'), (select id from t_ids where k = 'appt2')),
    'TH005', 'R1 FIXED: admin cannot move an appointment to another therapist');
  perform tests.assert_eq(
    tests.affected(format($q$update public.appointments
                               set session_period = tstzrange('2027-03-01 10:15 Europe/Amsterdam', '2027-03-01 11:15 Europe/Amsterdam', '[)')
                             where id = %L$q$, (select id from t_ids where k = 'appt2'))),
    1, 'admin can still reschedule (move in time) an appointment');
end;
$$;
reset role;

-- even the server cannot link a client row to a non-client account
set local role service_role;
do $$
begin
  perform tests.assert_raises(
    format($q$update public.clients set profile_id = (select id from public.profiles where user_id = %L) where id = %L$q$,
           tests.uid('admin'), '00000000-0000-4000-8000-0000000000e1'),
    'TH005', 'R1 FIXED: a client row can only be linked to a profile with role client (also for the server)');
end;
$$;
-- server stores the intake for that appointment, as the booking flow would
insert into public.intakes (appointment_id, answers, health_data_consent_at)
select id, '{"reason": "fictional complaint"}'::jsonb, now() from t_ids where k = 'appt2';
reset role;

select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.intakes), 0, 'R1 FIXED: admin cannot read any intake');
  perform tests.assert_eq(public.current_client_ids(), '{}'::uuid[], 'R1 FIXED: admin owns no client rows');
end;
$$;
reset role;

-- therapists cannot re-point their appointments either
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    format('update public.appointments set client_id = %L where id = %L', tests.client(1), (select id from t_ids where k = 'appt2')),
    'TH005', 'R1 FIXED: therapist cannot change the client of an appointment');
end;
$$;
reset role;

-- ================================================ R2 profiles insert/delete (F3) ==
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(
    tests.affected(format('delete from public.profiles where user_id = %L', tests.uid('client2'))), 0,
    'R2 FIXED: admin cannot delete another account''s profile');
  perform tests.assert_raises(
    format('insert into public.profiles (user_id, role) values (%L, %L)', tests.uid('client2'), 'admin'),
    'TH005', 'R2 FIXED: admin cannot create profiles (server only)');
  perform tests.assert_eq(
    tests.affected(format('update public.profiles set locale = ''en'' where user_id = %L', tests.uid('client2'))), 0,
    'R2 FIXED: admin is read-only on other profiles');
  perform tests.assert((select count(*) from public.profiles) >= 6, 'admin can still read all profiles');
end;
$$;
reset role;

-- ====================================================== R3 2FA / aal (F2) ===
select tests.login('ta', 'aal1');
set local role authenticated;
do $$
begin
  perform tests.assert(not public.mfa_satisfied(), 'R3 FIXED: therapist session at aal1 does not satisfy 2FA');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 0, 'R3 FIXED: therapist at aal1 reads no intakes');
  perform tests.assert_eq((select count(*)::integer from public.appointments), 0, 'R3 FIXED: therapist at aal1 reads no appointments');
  perform tests.assert_eq((select count(*)::integer from public.clients), 0, 'R3 FIXED: therapist at aal1 reads no clients');
  perform tests.assert_eq((select count(*)::integer from public.profiles), 1,
    'therapist at aal1 still sees own profile row (so the app can ask for TOTP)');
  perform tests.assert_raises(
    $q$insert into public.time_off (therapist_id, period)
       values (tests.therapist('A'), tstzrange('2027-03-02 13:00 Europe/Amsterdam', '2027-03-02 17:00 Europe/Amsterdam', '[)'))$q$,
    '42501', 'R3 FIXED: therapist at aal1 cannot write (RLS)');
  -- room_blocks: the template check already fails because aal1 sees no templates
  perform tests.assert_raises(
    $q$insert into public.room_blocks (room_id, therapist_id, period)
       values (tests.room(2), tests.therapist('A'), tstzrange('2027-03-02 13:00 Europe/Amsterdam', '2027-03-02 17:00 Europe/Amsterdam', '[)'))$q$,
    'TH006', 'R3 FIXED: therapist at aal1 cannot reserve blocks');
  perform tests.assert_raises(format('select public.read_intake(%L)', (select id from public.intakes limit 1)),
    '42501', 'R3 FIXED: therapist at aal1 cannot read intakes via read_intake()');
end;
$$;
reset role;

select tests.login('admin', 'aal1');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.rooms), 0, 'R3 FIXED: admin at aal1 reads nothing');
  perform tests.assert_eq(tests.affected('update public.rooms set name = name'), 0, 'R3 FIXED: admin at aal1 changes nothing');
end;
$$;
reset role;

select tests.login('client1', 'aal1');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.appointments), 1, 'clients work at aal1 (magic link only)');
end;
$$;
reset role;

select tests.login('ta');  -- aal2
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.appointments), 2, 'therapist at aal2 sees own appointments');
end;
$$;
reset role;

-- ========================================= R4 intakes of void bookings (F5) ==
set local role service_role;
insert into public.intakes (appointment_id, answers, health_data_consent_at)
select id, '{"reason": "fictional"}'::jsonb, now() from t_ids where k = 'appt1';
reset role;
update public.appointments set status = 'cancelled', cancel_reason = 'hold_expired'
 where id = (select id from t_ids where k = 'appt2');
do $$
declare
  v_hold uuid;
  v_intake uuid;
begin
  perform tests.assert(
    (select delete_after <= now() from public.intakes where appointment_id = (select id from t_ids where k = 'appt2')),
    'R4 FIXED: cancelling before the session makes its intake due for deletion now');
  perform tests.assert_eq(public.purge_expired_intakes(), 1, 'R4 FIXED: the next purge deletes it');
  perform tests.assert_eq(
    (select count(*)::integer from public.intakes i
       join public.appointments a on a.id = i.appointment_id where a.status = 'cancelled'), 0,
    'R4 FIXED: no intake of a cancelled booking remains');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 1, 'the intake of the confirmed booking is kept');

  -- the hold-expiry job path
  v_hold := tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 11:00 Europe/Amsterdam', tests.client(2), 'held');
  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values (v_hold, '{"reason": "fictional"}', now()) returning id into v_intake;
  update public.appointments set hold_expires_at = now() - interval '1 minute' where id = v_hold;
  perform public.expire_stale_holds();
  perform tests.assert((select delete_after <= now() from public.intakes where id = v_intake),
    'R4 FIXED: expire_stale_holds() also makes the intake due for deletion');

  -- intake stored after the booking was already cancelled
  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values ((select id from t_ids where k = 'appt2'), '{}', now()) returning id into v_intake;
  perform tests.assert((select delete_after <= now() from public.intakes where id = v_intake),
    'R4 FIXED: an intake stored for an already cancelled booking is due at once');
  perform public.purge_expired_intakes();
end;
$$;

-- ========================================= R5 deletion reason spoofing (F7) ==
insert into t_ids select 'intake_appt1', id from public.intakes where appointment_id = (select id from t_ids where k = 'appt1');
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform set_config('thnhc.deletion_reason', 'retention_expired', true);
  delete from public.intakes where appointment_id = (select id from t_ids where k = 'appt1');
  perform set_config('thnhc.deletion_reason', '', true);
end;
$$;
reset role;
do $$
begin
  perform tests.assert(not exists (select 1 from public.intakes where id = (select id from t_ids where k = 'intake_appt1')),
    'therapist deleted the intake');
  perform tests.assert_eq(
    (select reason from public.deletion_log where entity_id = (select id from t_ids where k = 'intake_appt1')),
    'manual', 'R5 FIXED: a manual deletion is always logged as manual, whatever the session setting');
  perform tests.assert_eq(
    (select count(*)::integer from public.deletion_log where reason = 'retention_expired'), 3,
    'only the purge job logged retention_expired (3 purged intakes)');
end;
$$;

-- ============================== R6 functions & default privileges (F6, F10) ===
do $$
declare
  v_list text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_list
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'execute');
  perform tests.assert_eq(v_list, 'is_bookable_therapist, is_public_service',
    'R6: only the two public catalogue helpers are executable by anon');

  perform tests.assert_eq(
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proconfig is null
             or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
    0, 'R6: every public function pins search_path');

  create table public.r6_probe (id int);
  perform tests.assert(not has_table_privilege('anon', 'public.r6_probe', 'select'),
    'R6 FIXED: a table added in a later migration is not granted to anon by default');
  perform tests.assert(not has_table_privilege('authenticated', 'public.r6_probe', 'select'),
    'R6 FIXED: nor to authenticated');
  drop table public.r6_probe;

  create function public.r6_probe_fn() returns int language sql set search_path = '' as 'select 1';
  perform tests.assert(not has_function_privilege('anon', 'public.r6_probe_fn()', 'execute'),
    'R6 FIXED: a function added later is not executable by anon/PUBLIC by default');
  drop function public.r6_probe_fn();

  perform tests.assert(not has_table_privilege('authenticated', 'public.intakes', 'truncate'),
    'R6 FIXED (F10): authenticated has no TRUNCATE on intakes');
  perform tests.assert(not has_table_privilege('authenticated', 'public.invoices', 'truncate'),
    'R6 FIXED (F10): authenticated has no TRUNCATE on invoices');
end;
$$;

-- ======================================== R7 therapist self-onboarding (F9) ==
select tests.login('tc');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    'update public.therapists set onboarding_status = ''complete'' where id = public.current_therapist_id()',
    'TH005', 'R7 FIXED: therapist cannot mark own onboarding complete');
end;
$$;
reset role;

-- ================================================= F8 intake reads are logged ==
set local role service_role;
insert into public.intakes (appointment_id, answers, health_data_consent_at)
values ((select id from t_ids where k = 'appt1'), '{"reason": "fictional again"}', now());
insert into t_ids select 'intakeF8', id from public.intakes where appointment_id = (select id from t_ids where k = 'appt1');
reset role;

select tests.login('ta');
set local role authenticated;
do $$
declare
  v_intake public.intakes;
  v_before integer := (select count(*) from public.intake_access_log);
begin
  perform tests.assert_raises('select answers from public.intakes', '42501',
    'F8: intake answers are not selectable directly');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 1, 'F8: intake metadata is still listable');
  v_intake := public.read_intake((select id from public.intakes limit 1));
  perform tests.assert_eq(v_intake.answers ->> 'reason', 'fictional again', 'F8: read_intake() returns the answers to the treating therapist');
  perform tests.assert_eq((select count(*)::integer from public.intake_access_log), v_before + 1, 'F8: and logs the access');
end;
$$;
reset role;

select tests.login('client1');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((public.read_intake((select id from public.intakes limit 1))).answers ->> 'reason', 'fictional again',
    'F8: the client reads own intake through read_intake()');
end;
$$;
reset role;

select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    format('select public.read_intake(%L)', (select id from t_ids where k = 'intakeF8')),
    '42501', 'F8: admin cannot use read_intake()');
end;
$$;
reset role;

-- ================================================= F4 scheduled-job health ==
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.job_health()), 2, 'F4: job_health() reports both jobs');
  perform tests.assert_eq((select count(*)::integer from public.job_health() where healthy), 0,
    'F4: without pg_cron (local) no job is reported healthy');
end;
$$;
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select string_agg(job_name, ',' order by job_name) from public.job_health()),
    'thnhc-expire-holds,thnhc-purge-intakes', 'F4: admin (aal2) can read job health');
end;
$$;
reset role;
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('select * from public.job_health()', '42501', 'F4: therapists cannot read job health');
end;
$$;
reset role;

-- ========================================== disproved: no other admin paths ==
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    format('update public.clients set profile_id = null where id = %L', tests.client(1)),
    'TH005', 'disproved: admin cannot unlink or take over an existing client record');
  perform tests.assert_eq(
    tests.affected(format('update public.intakes set client_id = %L', '00000000-0000-4000-8000-0000000000e1')),
    0, 'disproved: admin cannot move intakes (no rows visible)');
end;
$$;
reset role;

-- invoice immutability: issued invoice cannot be changed through admin_all
select public.issue_invoice(tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'appt1'), tests.client(1)));
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('update public.invoices set total_cents = 1, subtotal_cents = 1 where status = ''issued''',
    'TH003', 'disproved: admin cannot edit an issued invoice');
  perform tests.assert_raises('delete from public.invoices where status = ''issued''',
    'TH003', 'disproved: admin cannot delete an issued invoice');
  perform tests.assert_raises(
    'update public.invoice_lines set unit_cents = 1, line_total_cents = 1 where invoice_id in (select id from public.invoices where status = ''issued'')',
    'TH003', 'disproved: admin cannot edit lines of an issued invoice');
end;
$$;
reset role;

-- anon sees no client personal data
select tests.logout();
set local role anon;
do $$
begin
  perform tests.assert_raises('select first_name from public.clients', '42501', 'disproved: anon cannot read client names');
  perform tests.assert_raises('select 1 from public.intake_access_log', '42501', 'disproved: anon cannot read the intake access log');
  perform tests.assert_raises('select 1 from public.deletion_log', '42501', 'disproved: anon cannot read the deletion log');
  perform tests.assert_raises('select public.read_intake(null)', '42501', 'disproved: anon cannot call read_intake()');
end;
$$;
reset role;

rollback;
