-- Access & privacy (MASTER_PROMPT 2, 15): RLS per role, with real SQL as each role.
begin;
select tests.setup();

-- ------------------------------------------------------------- fixture --
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
select tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');

create temporary table t_ids (k text primary key, id uuid);
grant select on t_ids to anon, authenticated;
insert into t_ids values
  ('apptA',  tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(1))),
  ('apptB',  tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(2))),
  ('apptB3', tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(3), 'confirmed', 'manual'));

insert into public.intakes (appointment_id, answers, health_data_consent_at)
select id, '{"reason": "fictional complaint"}'::jsonb, now() from t_ids where k in ('apptA', 'apptB');
insert into t_ids select 'intakeA', id from public.intakes where therapist_id = tests.therapist('A');
insert into public.intake_access_log (intake_id, therapist_id, client_id, action)
select id, therapist_id, client_id, 'view' from public.intakes;

insert into public.therapist_business (therapist_id, legal_name, kvk_number) values
  (tests.therapist('A'), 'Praktijk A (test)', '11111111'),
  (tests.therapist('B'), 'Praktijk B (test)', '22222222');

select public.issue_invoice(tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'apptA'), tests.client(1)));
select public.issue_invoice(tests.draft_invoice(tests.therapist('B'), (select id from t_ids where k = 'apptB'), tests.client(2)));
-- a draft for client 1 (clients must not see drafts)
select tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'apptA'), tests.client(1), 500, 'final');

insert into public.payments (appointment_id, mollie_payment_id, amount_cents, status)
select id, 'tr_test_' || k, 2000, 'paid' from t_ids where k in ('apptA', 'apptB');

insert into public.calendar_connections (profile_id, provider, access_token_enc, refresh_token_enc)
select id, 'google', '\x00'::bytea, '\x00'::bytea from public.profiles where user_id = tests.uid('ta');

-- ============================================================ therapist A ==
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(public.auth_role(), 'therapist', 'auth_role() = therapist');
  perform tests.assert_eq(public.current_therapist_id(), tests.therapist('A'), 'current_therapist_id() = A');

  perform tests.assert_eq((select count(*)::integer from public.appointments), 1, 'therapist A sees only own appointments');
  perform tests.assert_eq((select count(*)::integer from public.appointments where therapist_id = tests.therapist('B')), 0,
    'therapist A cannot read therapist B''s appointments');
  perform tests.assert_eq(
    tests.affected(format('update public.appointments set status = %L where therapist_id = %L', 'cancelled', tests.therapist('B'))),
    0, 'therapist A cannot change therapist B''s appointments');

  perform tests.assert_eq((select array_agg(id) from public.clients), array[tests.client(1)],
    'therapist A sees only the client of own appointments');
  perform tests.assert_eq((select count(*)::integer from public.clients where id in (tests.client(2), tests.client(3))), 0,
    'therapist A cannot read therapist B''s clients (incl. B''s manual guest)');

  perform tests.assert_eq((select count(*)::integer from public.invoices where seller_therapist_id = tests.therapist('B')), 0,
    'therapist A cannot read therapist B''s invoices');
  perform tests.assert_eq((select count(*)::integer from public.invoices), 2, 'therapist A sees own invoices (issued + draft)');
  perform tests.assert_eq((select count(*)::integer from public.invoice_lines il
                             join public.invoices i on i.id = il.invoice_id
                            where i.seller_therapist_id = tests.therapist('B')), 0,
    'therapist A cannot read therapist B''s invoice lines');
  perform tests.assert_eq((select count(*)::integer from public.payments), 1, 'therapist A sees only own payments');

  perform tests.assert_eq((select count(*)::integer from public.intakes), 1, 'therapist A sees only own intakes');
  perform tests.assert_eq((select count(*)::integer from public.intake_access_log), 1, 'therapist A sees only own intake access log');

  -- business & tax details: read own, never write
  perform tests.assert_eq((select legal_name from public.therapist_business), 'Praktijk A (test)',
    'therapist A reads own business details only');
  perform tests.assert_eq(tests.affected('update public.therapist_business set kvk_number = ''99999999'''), 0,
    'therapist cannot update own business/tax details');
  perform tests.assert_raises(
    format('insert into public.therapist_business (therapist_id, legal_name) values (%L, %L)', tests.therapist('C'), 'x'),
    '42501', 'therapist cannot insert business details');

  -- own settings yes, admin-managed columns no
  perform tests.assert_eq(tests.affected('update public.therapists set bio_en = ''Updated bio'' where id = public.current_therapist_id()'), 1,
    'therapist updates own profile text');
  perform tests.assert_eq(tests.affected(format('update public.therapists set bio_en = ''x'' where id = %L', tests.therapist('B'))), 0,
    'therapist cannot update another therapist');
  perform tests.assert_raises('update public.therapists set bookable = false where id = public.current_therapist_id()',
    'TH005', 'therapist cannot change own bookable flag');
  perform tests.assert_raises('update public.therapists set intake_delivery = ''full_email'' where id = public.current_therapist_id()',
    'TH005', 'therapist cannot switch intake delivery to full e-mail (owner decides)');
  perform tests.assert_eq(tests.affected('update public.therapists set intake_retention_days = 30, reminder_hours = 48 where id = public.current_therapist_id()'), 1,
    'therapist sets own retention period and reminder timing');
  perform tests.assert_raises(
    format('update public.services set btw_treatment = %L where therapist_id = public.current_therapist_id()', '21'),
    'TH005', 'therapist cannot set BTW treatment of own service');
  perform tests.assert_raises('update public.profiles set role = ''admin'' where user_id = auth.uid()',
    'TH005', 'therapist cannot change own role');

  perform tests.assert_eq((select count(*)::integer from public.rent_settings), 0, 'therapist cannot read rent settings');
  perform tests.assert_raises('select access_token_enc from public.calendar_connections',
    '42501', 'calendar tokens are not readable through the API, not even by the owner');
  perform tests.assert_eq((select count(*)::integer from public.calendar_connections), 1, 'owner sees own calendar connection status');

  -- manual booking flow: create a client, book them; cannot use another therapist's client
  insert into public.clients (id, first_name, last_name, phone)
  values ('00000000-0000-4000-8000-0000000000d9', 'Telefoon', 'Cliënt', '0600000000');
  perform tests.assert_eq((select created_by_therapist_id from public.clients where id = '00000000-0000-4000-8000-0000000000d9'),
    tests.therapist('A'), 'client entered by a therapist is linked to that therapist');
  insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source)
  values (tests.therapist('A'), tests.room(1), '00000000-0000-4000-8000-0000000000d9', tests.session_type('A60'),
          tstzrange('2027-03-01 10:00 Europe/Amsterdam', '2027-03-01 11:00 Europe/Amsterdam', '[)'), 'confirmed', 'manual');
  perform tests.ok('therapist adds a manual booking for own client');
  perform tests.assert_raises(
    format($q$insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source)
              values (%L, %L, %L, %L, tstzrange('2027-03-01 11:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam', '[)'), 'confirmed', 'manual')$q$,
           tests.therapist('A'), tests.room(1), tests.client(3), tests.session_type('A60')),
    '42501', 'therapist cannot book a client that belongs to another therapist');
  perform tests.assert_raises(
    format($q$insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source)
              values (%L, %L, %L, %L, tstzrange('2027-03-01 11:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam', '[)'), 'confirmed', 'manual')$q$,
           tests.therapist('B'), tests.room(2), '00000000-0000-4000-8000-0000000000d9', tests.session_type('B60')),
    '42501', 'therapist cannot create appointments for another therapist');

  perform public.log_intake_access((select id from t_ids where k = 'intakeA'), 'view');
  perform tests.ok('treating therapist can log intake access');
end;
$$;
reset role;

-- ============================================================ therapist B ==
select tests.login('tb');
set local role authenticated;
do $$
begin
  perform tests.assert_eq((select array_agg(id order by id) from public.clients), array[tests.client(2), tests.client(3)],
    'therapist B sees own clients (booked + manual guest), not A''s');
  perform tests.assert_eq((select count(*)::integer from public.appointments where therapist_id = tests.therapist('A')), 0,
    'therapist B cannot read therapist A''s appointments');
  perform tests.assert_eq((select count(*)::integer from public.intakes where therapist_id = tests.therapist('A')), 0,
    'therapist B cannot read therapist A''s intakes');
  perform tests.assert_raises(format('select public.log_intake_access(%L)', (select id from t_ids where k = 'intakeA')),
    '42501', 'therapist B cannot open therapist A''s intake via log_intake_access');
end;
$$;
reset role;

-- ================================================================= admin ==
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(public.auth_role(), 'admin', 'auth_role() = admin');
  perform tests.assert_eq((select count(*)::integer from public.appointments), 4, 'admin sees all appointments (all calendars)');
  perform tests.assert_eq((select count(*)::integer from public.clients), 4, 'admin sees all clients');
  perform tests.assert_eq((select count(*)::integer from public.invoices), 3, 'admin sees all invoices');

  perform tests.assert_eq((select count(*)::integer from public.intakes), 0, 'admin cannot select intakes');
  perform tests.assert_eq((select count(*)::integer from public.intake_access_log), 0, 'admin cannot select the intake access log');
  perform tests.assert_eq(tests.affected('update public.intakes set answers = ''{}''::jsonb'), 0, 'admin cannot update intakes');
  perform tests.assert_eq(tests.affected('delete from public.intakes'), 0, 'admin cannot delete intakes');
  perform tests.assert_raises(
    format('insert into public.intakes (appointment_id, health_data_consent_at) values (%L, now())', (select id from t_ids where k = 'apptB3')),
    '42501', 'admin cannot insert intakes');
  perform tests.assert_raises(format('select public.log_intake_access(%L)', (select id from t_ids where k = 'intakeA')),
    '42501', 'admin cannot open an intake via log_intake_access');

  -- admin manages rooms, renters and their business details
  insert into public.rooms (number, name, kind) values (7, 'Kamer 7', 'shared');
  perform tests.ok('admin adds room 7');
  perform tests.assert_eq(tests.affected(format('update public.rooms set private_therapist_id = %L where number = 4', tests.therapist('A'))), 1,
    'admin assigns a private room');
  perform tests.assert_eq(tests.affected('update public.therapist_business set kvk_number = ''33333333'' where legal_name = ''Praktijk A (test)'''), 1,
    'admin writes therapist business/tax details');
  perform tests.assert_eq(tests.affected(format('update public.services set btw_treatment = %L, exemption_ground = %L where therapist_id = %L', 'exempt', 'test ground', tests.therapist('A'))), 1,
    'admin sets BTW treatment of a service');
  perform tests.assert_eq(tests.affected(format('update public.therapists set bookable = true where id = %L', tests.therapist('C'))), 1,
    'admin manages bookable flag');
  update public.therapists set bookable = false where id = tests.therapist('C');
  insert into public.block_templates (name, start_time, end_time) values ('Lunch', '12:00', '13:00');
  perform tests.ok('admin configures block templates');
  insert into public.rent_rates (room_id, pricing_mode, monthly_cents, valid_from) values (tests.room(4), 'fixed_monthly', 50000, '2026-11-01');
  perform tests.ok('admin configures rent rates');

  -- identity links stay with the server (prevents admin linking themselves to a therapist/client)
  perform tests.assert_raises(
    format('update public.therapists set profile_id = public.current_profile_id() where id = %L', tests.therapist('C')),
    'TH005', 'admin cannot link a therapist record to an account (server only)');
  perform tests.assert_raises(
    format('update public.clients set profile_id = public.current_profile_id() where id = %L', tests.client(3)),
    'TH005', 'admin cannot link a client record to an account (server only)');
  perform tests.assert_raises('update public.profiles set role = ''therapist'' where user_id = auth.uid()',
    'TH005', 'admin cannot change roles directly (server only)');

  perform tests.assert_raises('select public.purge_expired_intakes()', '42501', 'admin cannot run the purge job through the API');
end;
$$;
reset role;

-- =============================================================== client 1 ==
select tests.login('client1');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(public.auth_role(), 'client', 'auth_role() = client');
  perform tests.assert_eq((select array_agg(id) from public.appointments), array[(select id from t_ids where k = 'apptA')],
    'client sees only own appointments');
  perform tests.assert_eq((select array_agg(id) from public.clients), array[tests.client(1)], 'client sees only own client record');
  perform tests.assert_eq((select count(*)::integer from public.invoices), 1, 'client sees own issued invoice, not drafts');
  perform tests.assert_eq((select count(*)::integer from public.invoices where buyer_client_id <> tests.client(1)), 0,
    'client cannot see other clients'' invoices');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 1, 'client sees own intake');
  perform tests.assert_eq((select count(*)::integer from public.payments), 1, 'client sees own payment');
  perform tests.assert_eq((select count(*)::integer from public.therapist_business), 0, 'client cannot read therapist business details');
  perform tests.assert_eq((select count(*)::integer from public.rooms), 0, 'client cannot read rooms');
  perform tests.assert_eq(tests.affected('update public.appointments set status = ''cancelled'''), 0,
    'client cannot change appointments directly (server handles cancel + refund)');
  perform tests.assert_eq(tests.affected('update public.clients set phone = ''0611111111'''), 1, 'client updates own details');
  perform tests.assert_raises('update public.profiles set role = ''admin'' where user_id = auth.uid()',
    'TH005', 'client cannot make themselves admin');
  perform tests.assert_eq((select count(*)::integer from public.therapists), 2, 'logged-in client sees bookable therapists only');
end;
$$;
reset role;

-- =================================================================== anon ==
select tests.logout();
set local role anon;
do $$
begin
  perform tests.assert_raises('select * from public.clients', '42501', 'anon cannot read clients');
  perform tests.assert_raises('select * from public.appointments', '42501', 'anon cannot read appointments');
  perform tests.assert_raises('select * from public.intakes', '42501', 'anon cannot read intakes');
  perform tests.assert_raises('select * from public.invoices', '42501', 'anon cannot read invoices');
  perform tests.assert_raises('select * from public.payments', '42501', 'anon cannot read payments');
  perform tests.assert_raises('select * from public.profiles', '42501', 'anon cannot read profiles');
  perform tests.assert_raises('select * from public.therapist_business', '42501', 'anon cannot read business details');
  perform tests.assert_raises('select * from public.room_blocks', '42501', 'anon cannot read room blocks');
  perform tests.assert_raises('insert into public.clients (first_name, last_name) values (''x'', ''y'')', '42501',
    'anon cannot insert clients');

  perform tests.assert_eq(
    (select array_agg(display_name order by display_name) from (select id, slug, display_name, bio_nl, bio_en, photo_path, public_email from public.therapists) t),
    array['Test Therapeut A', 'Test Therapeut B'], 'anon reads public profile of bookable therapists only');
  perform tests.assert_raises('select profile_id from public.therapists', '42501', 'anon cannot read non-public therapist columns');
  perform tests.assert_raises('select * from public.therapists', '42501', 'anon cannot select * from therapists');
  perform tests.assert_eq((select count(*)::integer from public.services), 2, 'anon reads active services of bookable therapists');
  perform tests.assert_eq((select count(*)::integer from public.session_types), 3, 'anon reads session types of those services');
  perform tests.assert_eq((select count(*)::integer from public.therapies), 13, 'anon reads therapies');
  perform tests.assert_raises('select public.purge_expired_intakes()', '42501', 'anon cannot run server functions');
end;
$$;
reset role;

-- archived services disappear from the public site
update public.services set archived_at = now() where id = '00000000-0000-4000-8000-0000000000b2';
set local role anon;
do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.services), 1, 'archived service is hidden from anon');
  perform tests.assert_eq((select count(*)::integer from public.session_types), 2, 'its session types are hidden too');
end;
$$;
reset role;

rollback;
