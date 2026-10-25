-- Intake retention (MASTER_PROMPT 11.2, 15): expired intakes are deleted and
-- logged; invoices and payments are never touched.
begin;
select tests.setup();
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
select tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');

create temporary table t_ids (k text primary key, id uuid);
grant select on t_ids to authenticated, service_role;
insert into t_ids values
  ('appt1', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 08:00 Europe/Amsterdam')),
  ('appt2', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam')),
  ('appt3', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam'));

do $$
declare
  v_id uuid;
begin
  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values ((select id from t_ids where k = 'appt1'), '{"reason": "fictional"}', now())
  returning id into v_id;
  insert into t_ids values ('intake1', v_id);
  perform tests.assert_eq((select delete_after from public.intakes where id = v_id), now() + interval '365 days',
    'delete_after defaults to the therapist''s retention (12 months)');
  perform tests.assert_eq((select (therapist_id, client_id)::text from public.intakes where id = v_id),
    (tests.therapist('A'), tests.client(1))::text, 'intake therapist/client are copied from the appointment');

  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values ((select id from t_ids where k = 'appt2'), '{"reason": "fictional"}', now()) returning id into v_id;
  insert into t_ids values ('intake2', v_id);
  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values ((select id from t_ids where k = 'appt3'), '{"reason": "fictional"}', now()) returning id into v_id;
  insert into t_ids values ('intake3', v_id);

  update public.intakes set delete_after = now() - interval '1 day'  where id = (select id from t_ids where k = 'intake1');
  update public.intakes set delete_after = now() + interval '30 days' where id = (select id from t_ids where k = 'intake2');
  update public.intakes set delete_after = null                       where id = (select id from t_ids where k = 'intake3');

  perform tests.assert_raises(
    format('update public.intakes set appointment_id = %L where id = %L',
           (select id from t_ids where k = 'appt2'), (select id from t_ids where k = 'intake3')),
    'TH005', 'an intake cannot be moved to another appointment');

  -- financial records for the expired intake's appointment
  perform public.issue_invoice(tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'appt1'), tests.client(1), 2000));
  insert into public.payments (appointment_id, mollie_payment_id, amount_cents, status)
  values ((select id from t_ids where k = 'appt1'), 'tr_test_retention', 2000, 'paid');
end;
$$;

-- therapists / clients cannot run the purge job
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_raises('select public.purge_expired_intakes()', '42501',
    'purge_expired_intakes() is not callable by therapists');
end;
$$;
reset role;

-- the job runs as the server (service role, e.g. via pg_cron)
select tests.logout();
set local role service_role;
do $$
begin
  perform tests.assert_eq(public.purge_expired_intakes(), 1, 'purge deletes exactly the expired intake');
end;
$$;
reset role;

do $$
declare
  v_expired uuid := (select id from t_ids where k = 'intake1');
begin
  perform tests.assert(not exists (select 1 from public.intakes where id = v_expired), 'expired intake is gone');
  perform tests.assert_eq((select count(*)::integer from public.intakes), 2,
    'intakes not yet expired (or kept until manual deletion) remain');
  perform tests.assert_eq(
    (select (reason, deleted_by is null)::text from public.deletion_log where entity_type = 'intake' and entity_id = v_expired),
    '(retention_expired,t)', 'deletion_log records the system purge');
  perform tests.assert_eq((select count(*)::integer from public.invoices where appointment_id = (select id from t_ids where k = 'appt1') and status = 'issued'), 1,
    'invoice of the purged intake''s appointment is intact');
  perform tests.assert_eq((select total_cents from public.invoices where appointment_id = (select id from t_ids where k = 'appt1')), 2000,
    'invoice amount unchanged');
  perform tests.assert_eq((select count(*)::integer from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
                            where i.appointment_id = (select id from t_ids where k = 'appt1')), 1, 'invoice lines intact');
  perform tests.assert_eq((select count(*)::integer from public.payments where mollie_payment_id = 'tr_test_retention'), 1, 'payment intact');
  perform tests.assert_eq((select status from public.appointments where id = (select id from t_ids where k = 'appt1')), 'confirmed',
    'appointment intact');
  perform tests.assert_eq(public.purge_expired_intakes(), 0, 'running the purge again deletes nothing');
end;
$$;

-- therapist deletes an intake manually: logged as manual, by that therapist
select tests.login('tb');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(tests.affected('delete from public.intakes'), 0, 'therapist B cannot delete therapist A''s intakes');
end;
$$;
reset role;

select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert_eq(
    tests.affected(format('delete from public.intakes where id = %L', (select id from t_ids where k = 'intake3'))), 1,
    'treating therapist deletes an intake manually');
  perform tests.assert_eq(
    (select reason from public.deletion_log where entity_id = (select id from t_ids where k = 'intake3')), 'manual',
    'manual deletion is logged as manual');
  perform tests.assert_eq(
    (select deleted_by from public.deletion_log where entity_id = (select id from t_ids where k = 'intake3')),
    public.current_profile_id(), 'deletion_log records who deleted it');
end;
$$;
reset role;

-- retention "until manually deleted" → delete_after stays null
update public.therapists set intake_retention_days = null where id = tests.therapist('B');
do $$
declare
  v_id uuid;
begin
  insert into public.intakes (appointment_id, answers, health_data_consent_at)
  values (tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(2)),
          '{}', now())
  returning id into v_id;
  perform tests.assert((select delete_after is null from public.intakes where id = v_id),
    'retention "until manually deleted" leaves delete_after empty');
end;
$$;

rollback;
