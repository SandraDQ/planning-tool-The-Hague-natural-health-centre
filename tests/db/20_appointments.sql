-- Tier 2: appointments (MASTER_PROMPT 3.2, 3.3, 15 Scheduling).
-- Blocks: A holds room 1, B holds room 2, Monday 2027-03-01 08:00-12:00.
-- C has private room 3. All therapists start with buffer 0.
begin;
select tests.setup();
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
select tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');

-- ------------------------------------------------- overlaps & block containment --
do $$
declare
  v_a1 uuid;
  v_appt public.appointments;
begin
  v_a1 := tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam');
  select * into v_appt from public.appointments where id = v_a1;
  perform tests.assert(v_appt.room_block_id is not null, 'shared-room appointment is linked to its block');
  perform tests.assert_eq(v_appt.period, v_appt.session_period, 'with buffer 0 the period equals the session');
  perform tests.assert_eq(v_appt.price_cents, 8000, 'price snapshot taken from session type');
  perform tests.assert_eq(v_appt.deposit_cents, 2000, 'fixed deposit snapshot taken from service');
  perform tests.assert_eq(v_appt.service_name_en, 'Test massage', 'service name snapshot');
  perform tests.assert_eq(v_appt.cancellation_policy ->> 'notice_value', '24', 'cancellation policy snapshot');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:30 Europe/Amsterdam')$q$,
    '23P01', 'overlapping appointment for the same therapist is rejected', '%appointments_no_therapist_overlap%');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 13:00 Europe/Amsterdam')$q$,
    'TH001', 'shared-room appointment outside any block is rejected');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 2, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam')$q$,
    'TH001', 'shared-room appointment inside another therapist''s block is rejected');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A90'), '2027-03-01 10:45 Europe/Amsterdam')$q$,
    'TH001', 'appointment running past the block end (10:45 + 90 min) is rejected');

  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 11:00 Europe/Amsterdam') is not null,
    'appointment ending exactly at the block end fits');

  perform tests.assert(
    tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(2)) is not null,
    'another therapist in another room at the same time is fine');
  perform tests.assert_eq(
    (select deposit_cents from public.appointments where therapist_id = tests.therapist('B')), 1750,
    'percentage deposit snapshot: 25% of 70.00 = 17.50');

  -- private room
  perform tests.assert(
    tests.book(tests.therapist('C'), 3, tests.session_type('C90'), '2027-03-01 09:00 Europe/Amsterdam') is not null,
    'private-room therapist books in own room without a block');
  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 3, tests.session_type('A60'), '2027-03-01 14:00 Europe/Amsterdam')$q$,
    'TH002', 'appointment in a private room assigned to someone else is rejected');
  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('C'), 1, tests.session_type('C90'), '2027-03-01 14:00 Europe/Amsterdam')$q$,
    'TH001', 'private-room therapist cannot book a shared room without a block');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('B60'), '2027-03-01 10:00 Europe/Amsterdam')$q$,
    'TH008', 'session type of another therapist is rejected');

  -- cancelling frees the slot
  update public.appointments set status = 'cancelled', cancel_reason = 'client' where id = v_a1;
  perform tests.assert(
    (select cancelled_at is not null from public.appointments where id = v_a1), 'cancelled_at is stamped');
  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam') is not null,
    'a cancelled appointment frees its slot');
end;
$$;

-- ------------------------------------------------------------- holds (D5) --
do $$
declare
  v_hold uuid;
begin
  v_hold := tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(1), 'held');
  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(2))$q$,
    '23P01', 'a held slot cannot be booked by someone else');

  update public.appointments set hold_expires_at = now() - interval '1 minute' where id = v_hold;
  perform tests.assert_eq(public.expire_stale_holds(), 1, 'expire_stale_holds cancels the expired hold');
  perform tests.assert_eq((select cancel_reason from public.appointments where id = v_hold), 'hold_expired',
    'expired hold is marked hold_expired');
  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 10:00 Europe/Amsterdam', tests.client(2)) is not null,
    'after expiry the slot can be booked');

  perform tests.assert_raises(
    format($q$insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source)
              values (%L, %L, %L, %L, tstzrange('2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 09:00 Europe/Amsterdam', '[)'), 'held', 'online')$q$,
           tests.therapist('A'), tests.room(1), tests.client(1), tests.session_type('A60')),
    '23514', 'a hold must have an expiry time', '%appointments_hold_has_expiry%');
end;
$$;

-- ------------------------------------------------------------ deposit rules --
do $$
begin
  perform tests.assert_raises(
    format($q$insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source, deposit_cents)
              values (%L, %L, %L, %L, tstzrange('2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 09:00 Europe/Amsterdam', '[)'), 'confirmed', 'online', 99)$q$,
           tests.therapist('A'), tests.room(1), tests.client(1), tests.session_type('A60')),
    '23514', 'online booking needs a deposit of at least 100 cents', '%appointments_online_deposit_min%');

  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 08:00 Europe/Amsterdam', tests.client(1), 'confirmed', 'manual') is not null,
    'manual (phone/paper) booking without deposit is allowed and blocks the slot');
  perform tests.assert_eq(
    (select deposit_cents from public.appointments where source = 'manual'), 0, 'manual booking deposit defaults to 0');

  perform tests.assert_raises(
    $q$insert into public.services (therapist_id, therapy_id, name_nl, name_en, deposit_type, deposit_value)
       values (tests.therapist('A'), (select id from public.therapies where slug = 'massage'), 'x', 'x', 'fixed', 99)$q$,
    '23514', 'a fixed service deposit below EUR 1 is rejected', '%services_deposit_valid%');
end;
$$;

-- --------------------------------------------- block release with bookings (Q4) --
do $$
declare
  v_block uuid := (select id from public.room_blocks where therapist_id = tests.therapist('A') and room_id = tests.room(1));
begin
  perform tests.assert_raises(
    format('update public.room_blocks set status = %L where id = %L', 'released', v_block),
    'TH004', 'a block with confirmed appointments cannot be released');
  perform tests.assert_raises(
    format('delete from public.room_blocks where id = %L', v_block),
    'TH004', 'a block with confirmed appointments cannot be deleted');
  perform tests.assert_raises(
    format($q$update public.room_blocks
                set period = tstzrange('2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 10:00 Europe/Amsterdam', '[)')
              where id = %L$q$, v_block),
    'TH004', 'a block cannot be shortened so that appointments fall outside it');

  update public.appointments set status = 'cancelled' where room_block_id = v_block and status in ('held', 'confirmed');
  update public.room_blocks set status = 'released' where id = v_block;
  perform tests.assert_eq((select status from public.room_blocks where id = v_block), 'released',
    'after cancelling its appointments the block can be released');
end;
$$;

-- ------------------------------------------------------------ buffer (3.3) --
-- Tuesday 2027-03-02, A holds room 1 08:00-12:00, buffer 15 minutes.
update public.therapists set buffer_minutes = 15 where id = tests.therapist('A');
select tests.block(tests.therapist('A'), 1, '2027-03-02 08:00 Europe/Amsterdam', '2027-03-02 12:00 Europe/Amsterdam');

do $$
declare
  v_first uuid;
begin
  v_first := tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-02 08:00 Europe/Amsterdam');
  perform tests.assert_eq(
    (select upper(period) from public.appointments where id = v_first),
    '2027-03-02 09:15 Europe/Amsterdam'::timestamptz, 'period includes the 15 min buffer (08:00-09:15)');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-02 09:00 Europe/Amsterdam')$q$,
    '23P01', 'a booking inside the previous session''s buffer is rejected', '%appointments_no_therapist_overlap%');

  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-02 09:15 Europe/Amsterdam') is not null,
    'a booking right after the buffer is fine');

  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-02 11:00 Europe/Amsterdam')$q$,
    'TH001', 'session that fits but whose buffer runs past the block end is rejected');

  perform tests.assert(
    tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-02 10:45 Europe/Amsterdam') is not null,
    'session + buffer ending exactly at the block end fits');

  -- Changing settings never alters existing bookings (D6, 15)
  update public.therapists set buffer_minutes = 45 where id = tests.therapist('A');
  update public.session_types set price_cents = 9999, duration_min = 30 where id = tests.session_type('A60');
  update public.appointments set status = 'confirmed' where id = v_first;  -- touch the row
  perform tests.assert_eq(
    (select upper(period) from public.appointments where id = v_first),
    '2027-03-02 09:15 Europe/Amsterdam'::timestamptz, 'existing booking keeps its buffer after the setting changes');
  perform tests.assert_eq(
    (select price_cents from public.appointments where id = v_first), 8000,
    'existing booking keeps its price after the session type changes');
  perform tests.assert_eq(
    (select duration_min from public.appointments where id = v_first), 60,
    'existing booking keeps its duration after the session type changes');
end;
$$;

-- ------------------------------ room-level exclusion (defense in depth) --
-- The room trigger normally stops other therapists from using a room first, so
-- to prove the room exclusion constraint itself we switch that trigger off.
alter table public.appointments disable trigger trg_appointments_2_check_room;
do $$
begin
  perform tests.book(tests.therapist('C'), 3, tests.session_type('C90'), '2027-03-03 09:00 Europe/Amsterdam');
  perform tests.assert_raises(
    $q$select tests.book(tests.therapist('B'), 3, tests.session_type('B60'), '2027-03-03 09:30 Europe/Amsterdam', tests.client(2))$q$,
    '23P01', 'overlapping appointments in the same room are rejected (room exclusion)', '%appointments_no_room_overlap%');
end;
$$;
alter table public.appointments enable trigger trg_appointments_2_check_room;

-- ------------------------------------------------ paper windows (3.5, Q3) --
do $$
declare
  v_window uuid;
  v_appt uuid;
begin
  insert into public.paper_windows (therapist_id, room_id, period)
  values (tests.therapist('C'), tests.room(3),
          tstzrange('2027-03-04 14:00 Europe/Amsterdam', '2027-03-04 16:00 Europe/Amsterdam', '[)'))
  returning id into v_window;

  insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source, paper_window_id)
  values (tests.therapist('C'), tests.room(3), tests.client(1), tests.session_type('C90'),
          tstzrange('2027-03-04 14:00 Europe/Amsterdam', '2027-03-04 15:30 Europe/Amsterdam', '[)'), 'confirmed', 'online', v_window)
  returning id into v_appt;
  perform tests.assert_eq((select status from public.paper_windows where id = v_window), 'filled',
    'paper window closes once booked');

  perform tests.assert_raises(
    format($q$insert into public.appointments (therapist_id, room_id, client_id, session_type_id, session_period, status, source, paper_window_id)
              values (%L, %L, %L, %L, tstzrange('2027-03-04 15:30 Europe/Amsterdam', '2027-03-04 17:00 Europe/Amsterdam', '[)'), 'confirmed', 'online', %L)$q$,
           tests.therapist('C'), tests.room(3), tests.client(2), tests.session_type('C90'), v_window),
    'TH007', 'a filled paper window cannot be booked again');

  update public.appointments set status = 'cancelled' where id = v_appt;
  perform tests.assert_eq((select status from public.paper_windows where id = v_window), 'open',
    'paper window reopens when its booking is cancelled');

  perform tests.assert_raises(
    format($q$insert into public.paper_windows (therapist_id, room_id, period)
              values (%L, %L, tstzrange('2027-03-04 14:00 Europe/Amsterdam', '2027-03-04 16:00 Europe/Amsterdam', '[)'))$q$,
           tests.therapist('A'), tests.room(5)),
    'TH001', 'paper window in a shared room must sit inside a block of that therapist');
end;
$$;

-- -------------------------------------------- rooms: admin config safety --
do $$
begin
  perform tests.assert_raises(
    format('update public.rooms set kind = %L where number = 2', 'private'),
    'TH004', 'a shared room with future blocks cannot be turned private');
  perform tests.assert_raises(
    format('update public.rooms set private_therapist_id = %L where number = 3', tests.therapist('A')),
    'TH004', 'a private room with future appointments cannot be reassigned');
  perform tests.assert_raises(
    'update public.rooms set active = false where number = 2',
    'TH004', 'a room with future blocks cannot be deactivated');
  update public.rooms set private_therapist_id = tests.therapist('A') where number = 4;
  perform tests.assert_eq((select private_therapist_id from public.rooms where number = 4), tests.therapist('A'),
    'an unused private room can be assigned');
end;
$$;

rollback;
