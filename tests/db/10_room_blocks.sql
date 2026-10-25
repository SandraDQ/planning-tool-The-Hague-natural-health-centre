-- Tier 1: room blocks (MASTER_PROMPT 3.1). 2027-03-01 is a Monday.
begin;
select tests.setup();

-- --------------------------------------------- exclusion: one block per room --
do $$
declare
  v_block uuid;
begin
  v_block := tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
  perform tests.assert(v_block is not null, 'therapist A reserves room 1, Monday 08:00-12:00');

  perform tests.assert_raises(
    $q$select tests.block(tests.therapist('B'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam')$q$,
    '23P01', 'double reservation of the same block is rejected (exclusion constraint)', '%room_blocks_no_overlap%');

  perform tests.assert_raises(
    $q$select tests.block(tests.therapist('B'), 1, '2027-03-01 10:00 Europe/Amsterdam', '2027-03-01 14:00 Europe/Amsterdam')$q$,
    '23P01', 'partially overlapping block in the same room is rejected', '%room_blocks_no_overlap%');

  perform tests.assert(
    tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam') is not null,
    'same time in another room is fine');

  perform tests.assert(
    tests.block(tests.therapist('B'), 1, '2027-03-01 12:00 Europe/Amsterdam', '2027-03-01 13:00 Europe/Amsterdam') is not null,
    'adjacent block (ends meet) is fine');

  update public.room_blocks set status = 'released' where id = v_block;
  perform tests.assert(
    (select released_at is not null from public.room_blocks where id = v_block), 'releasing a block stamps released_at');

  perform tests.assert(
    tests.block(tests.therapist('B'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam') is not null,
    'a released block can be reserved by someone else');

  perform tests.assert_raises(
    format('update public.room_blocks set status = %L where id = %L', 'reserved', v_block),
    '23P01', 're-reserving a released block that someone else now holds is rejected');

  perform tests.assert_raises(
    $q$select tests.block(tests.therapist('A'), 3, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam')$q$,
    'TH006', 'blocks cannot be reserved in a private room');

  update public.rooms set active = false where number = 5;
  perform tests.assert_raises(
    $q$select tests.block(tests.therapist('A'), 5, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam')$q$,
    'TH006', 'blocks cannot be reserved in an inactive room');
  update public.rooms set active = true where number = 5;
end;
$$;

-- --------------------------------------------------- therapist acting via API --
select tests.login('ta');
set local role authenticated;

do $$
declare
  v_block uuid;
begin
  insert into public.room_blocks (room_id, therapist_id, period)
  values (tests.room(2), tests.therapist('A'),
          tstzrange('2027-03-02 13:00 Europe/Amsterdam', '2027-03-02 17:00 Europe/Amsterdam', '[)'))
  returning id into v_block;
  perform tests.assert(v_block is not null, 'therapist reserves an aligned future block for themselves');
  perform tests.assert(
    (select reserved_by = public.current_profile_id() from public.room_blocks where id = v_block),
    'reserved_by is the therapist''s profile');

  perform tests.assert_raises(
    $q$insert into public.room_blocks (room_id, therapist_id, period)
       values (tests.room(2), tests.therapist('A'),
               tstzrange('2027-03-03 09:00 Europe/Amsterdam', '2027-03-03 13:00 Europe/Amsterdam', '[)'))$q$,
    'TH006', 'therapist cannot reserve a block that does not match a template');

  perform tests.assert_raises(
    $q$insert into public.room_blocks (room_id, therapist_id, period)
       values (tests.room(2), tests.therapist('B'),
               tstzrange('2027-03-03 08:00 Europe/Amsterdam', '2027-03-03 12:00 Europe/Amsterdam', '[)'))$q$,
    '42501', 'therapist cannot reserve a block in another therapist''s name (RLS)');

  perform tests.assert_raises(
    $q$insert into public.room_blocks (room_id, therapist_id, period)
       values (tests.room(2), tests.therapist('A'),
               tstzrange('2026-01-05 08:00 Europe/Amsterdam', '2026-01-05 12:00 Europe/Amsterdam', '[)'))$q$,
    'TH009', 'therapist cannot reserve a block in the past');

  perform tests.assert_raises(
    format($q$update public.room_blocks
                 set period = tstzrange('2027-03-02 18:00 Europe/Amsterdam', '2027-03-02 22:00 Europe/Amsterdam', '[)')
               where id = %L$q$, v_block),
    'TH005', 'therapist cannot move a block (release + reserve instead)');

  perform tests.assert(
    (select count(*) from public.room_blocks where therapist_id = tests.therapist('B')) > 0,
    'therapist sees the room grid incl. other therapists'' blocks');

  perform tests.assert_eq(
    tests.affected(format('update public.room_blocks set status = %L where therapist_id = %L', 'released', tests.therapist('B'))),
    0, 'therapist cannot release another therapist''s block');

  perform tests.assert_eq(
    tests.affected(format('update public.room_blocks set status = %L where id = %L', 'released', v_block)),
    1, 'therapist releases own future block');
end;
$$;

-- ---------------------------- weekly series → concrete blocks, across DST --
-- 2027-03-28 is the last Sunday of March (clocks go forward).
do $$
declare
  v_series uuid;
  v_n integer;
begin
  insert into public.block_series (room_id, therapist_id, block_template_id, weekday, starts_on, ends_on)
  values (tests.room(5), tests.therapist('A'),
          (select id from public.block_templates where start_time = '08:00'), 7, '2027-03-21', '2027-04-04')
  returning id into v_series;

  v_n := public.materialize_block_series(v_series, '2027-12-31');
  perform tests.assert_eq(v_n, 3, 'series generates one block per Sunday (3 in range)');

  perform tests.assert_eq(
    (select count(*)::integer from public.room_blocks
      where series_id = v_series
        and (lower(period) at time zone 'Europe/Amsterdam')::time = '08:00'
        and (upper(period) at time zone 'Europe/Amsterdam')::time = '12:00'
        and upper(period) - lower(period) = interval '4 hours'),
    3, 'every generated block is 08:00-12:00 local, 4 hours, also on the DST Sunday');

  perform tests.assert_eq(
    (select lower(period) from public.room_blocks where series_id = v_series and series_occurrence = '2027-03-28'),
    '2027-03-28 06:00:00+00'::timestamptz, 'DST Sunday block starts 06:00 UTC (CEST)');
  perform tests.assert_eq(
    (select lower(period) from public.room_blocks where series_id = v_series and series_occurrence = '2027-03-21'),
    '2027-03-21 07:00:00+00'::timestamptz, 'Sunday before DST starts 07:00 UTC (CET)');

  perform tests.assert_eq(public.materialize_block_series(v_series, '2027-12-31'), 0,
    'materializing again is idempotent');

  update public.room_blocks set status = 'released' where series_id = v_series and series_occurrence = '2027-03-28';
  perform tests.assert_eq(public.materialize_block_series(v_series, '2027-12-31'), 0,
    'a released occurrence (exception) is not recreated');
  perform tests.assert_eq(
    (select status from public.room_blocks where series_id = v_series and series_occurrence = '2027-03-28'),
    'released', 'the exception stays released');
end;
$$;

reset role;

-- A series that collides with someone else's block skips that date.
do $$
declare
  v_series uuid;
begin
  perform tests.block(tests.therapist('B'), 5, '2027-05-09 08:00 Europe/Amsterdam', '2027-05-09 12:00 Europe/Amsterdam');
  insert into public.block_series (room_id, therapist_id, block_template_id, weekday, starts_on, ends_on)
  values (tests.room(5), tests.therapist('A'),
          (select id from public.block_templates where start_time = '08:00'), 7, '2027-05-02', '2027-05-16')
  returning id into v_series;
  perform tests.assert_eq(public.materialize_block_series(v_series, '2027-12-31'), 2,
    'series skips the Sunday already held by another therapist (first come, first served)');

  perform tests.assert_raises(
    format($q$insert into public.block_series (room_id, therapist_id, block_template_id, weekday, starts_on)
              values (%L, %L, (select id from public.block_templates where start_time = '08:00'), 1, '2027-05-03')$q$,
           tests.room(3), tests.therapist('A')),
    'TH006', 'block series cannot be created for a private room');
end;
$$;

rollback;
