-- Room rent (MASTER_PROMPT 9.4, D12) and money rules.
begin;
select tests.setup();

-- --------------------------------------------- rent rates: pricing modes (D12) --
do $$
begin
  insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from)
  values (null, 'per_block', 2500, '2026-11-01');
  perform tests.ok('default per-block rate for shared rooms');

  insert into public.rent_rates (room_id, pricing_mode, per_block_cents, btw_treatment, valid_from)
  values (tests.room(1), 'per_block', 3000, '21', '2026-11-01');
  perform tests.ok('room-specific per-block rate');

  insert into public.rent_rates (room_id, pricing_mode, monthly_cents, btw_treatment, exemption_ground, valid_from)
  values (tests.room(3), 'fixed_monthly', 60000, 'exempt', 'test ground', '2026-11-01');
  perform tests.ok('fixed monthly rate for private room 3');

  perform tests.assert_raises(
    $q$insert into public.rent_rates (room_id, pricing_mode, monthly_cents, valid_from) values (null, 'fixed_monthly', 1000, '2026-11-01')$q$,
    '23514', 'a fixed monthly rate needs a specific room', '%rent_rates_mode_amounts%');
  perform tests.assert_raises(
    format($q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, monthly_cents, valid_from) values (%L, 'per_block', 100, 100, '2027-06-01')$q$, tests.room(2)),
    '23514', 'a per-block rate cannot also carry a monthly amount', '%rent_rates_mode_amounts%');
  perform tests.assert_raises(
    format($q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from) values (%L, 'per_block', -1, '2027-06-01')$q$, tests.room(2)),
    '23514', 'negative rent is rejected');
  perform tests.assert_raises(
    format($q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, btw_treatment, valid_from) values (%L, 'per_block', 100, 'exempt', '2027-06-01')$q$, tests.room(2)),
    '23514', 'BTW exempt rent needs an exemption ground', '%rent_rates_exemption_ground%');

  perform tests.assert_raises(
    format($q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from) values (%L, 'per_block', 2000, '2027-01-01')$q$, tests.room(3)),
    '23P01', 'two rates for the same room cannot overlap in time', '%rent_rates_no_overlap%');

  update public.rent_rates set valid_until = '2026-12-31' where room_id = tests.room(3);
  insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from)
  values (tests.room(3), 'per_block', 2000, '2027-01-01');
  perform tests.ok('a room can switch pricing mode from a new date once the old rate is closed');

  perform tests.assert_raises(
    $q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from) values (null, 'per_block', 2600, '2027-01-01')$q$,
    '23P01', 'the default rate cannot overlap itself either');

  perform tests.assert_raises('insert into public.rent_settings (billing_day) values (5)', '23505',
    'rent_settings is a single row');
  perform tests.assert_raises('update public.rent_settings set billing_day = 31', '23514', 'billing day is 1..28');
  perform tests.assert_raises($q$insert into public.rent_runs (month) values ('2026-11-15')$q$, '23514',
    'a rent run is for a calendar month (first day)');
end;
$$;

-- therapists can read rates, not change them
select tests.login('ta');
set local role authenticated;
do $$
begin
  perform tests.assert((select count(*) from public.rent_rates) > 0, 'therapist can read rent rates');
  perform tests.assert_raises(
    format($q$insert into public.rent_rates (room_id, pricing_mode, per_block_cents, valid_from) values (%L, 'per_block', 1, '2030-01-01')$q$, tests.room(5)),
    '42501', 'therapist cannot create rent rates');
  perform tests.assert_eq(tests.affected('update public.rent_rates set per_block_cents = 1'), 0, 'therapist cannot change rent rates');
  perform tests.assert_eq((select count(*)::integer from public.rent_runs), 0, 'therapist cannot see rent runs');
end;
$$;
reset role;

-- ------------------------------------------------------------ money rules --
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
do $$
declare
  v_appt uuid := tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam');
  v_pay uuid;
begin
  perform tests.assert_raises(
    format($q$insert into public.payments (appointment_id, mollie_payment_id, amount_cents) values (%L, 'tr_small', 99)$q$, v_appt),
    '23514', 'a deposit payment is at least 100 cents');

  insert into public.payments (appointment_id, mollie_payment_id, amount_cents, status)
  values (v_appt, 'tr_ok', 2000, 'paid') returning id into v_pay;
  perform tests.assert_raises(
    format($q$insert into public.payments (appointment_id, mollie_payment_id, amount_cents) values (%L, 'tr_ok', 2000)$q$, v_appt),
    '23505', 'the same Mollie payment id cannot be stored twice');

  insert into public.refunds (payment_id, amount_cents, reason) values (v_pay, 1500, 'late_cancellation');
  perform tests.assert_raises(
    format($q$insert into public.refunds (payment_id, amount_cents, reason) values (%L, 600, 'other')$q$, v_pay),
    'TH010', 'refunds can never exceed the payment');
  insert into public.refunds (payment_id, amount_cents, reason) values (v_pay, 500, 'other');
  perform tests.ok('refunds up to the full payment are allowed');

  insert into public.webhook_events (provider, event_id) values ('mollie', 'tr_ok:paid');
  perform tests.assert_raises($q$insert into public.webhook_events (provider, event_id) values ('mollie', 'tr_ok:paid')$q$,
    '23505', 'duplicate webhook events are rejected (idempotency)');

  perform tests.assert_raises(
    format($q$insert into public.balance_payments (appointment_id, method, amount_cents, paid_on) values (%L, 'bitcoin', 100, current_date)$q$, v_appt),
    '23514', 'balance payment method must be cash, pin, transfer or tikkie');
end;
$$;

create temporary table t_appt as select id from public.appointments where therapist_id = tests.therapist('A');
grant select on t_appt to authenticated;

-- therapist records a balance payment for own appointment
select tests.login('ta');
set local role authenticated;
do $$
begin
  insert into public.balance_payments (appointment_id, method, amount_cents, paid_on)
  select id, 'pin', 6000, '2027-03-01' from public.appointments limit 1;
  perform tests.assert_eq((select recorded_by from public.balance_payments), public.current_profile_id(),
    'balance payment records who entered it');
end;
$$;
reset role;

select tests.login('tb');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    format($q$insert into public.balance_payments (appointment_id, method, amount_cents, paid_on)
              values (%L, 'cash', 100, current_date)$q$, (select id from t_appt)),
    '42501', 'therapist B cannot record a balance payment on A''s appointment');
  perform tests.assert_eq((select count(*)::integer from public.balance_payments), 0, 'therapist B cannot see A''s balance payments');
end;
$$;
reset role;

rollback;
