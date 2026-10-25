-- =============================================================================
-- THNHC platform · 0004 rooms & time (the scheduling core)
--
-- Two layers (MASTER_PROMPT 3): room_blocks = the lease, appointments = the
-- guest list. Postgres is the final referee:
--   * EXCLUDE: one reserved block per room at a time
--   * EXCLUDE: one held/confirmed appointment per therapist and per room at a time
--   * TRIGGER: a shared-room appointment (incl. buffer) must lie inside a
--              reserved block of the same therapist and room; a private-room
--              appointment must be in the room assigned to that therapist.
-- Rooms, block templates and renters (therapists) are managed in the admin portal.
-- =============================================================================

create table public.rooms (
  id                    uuid primary key default gen_random_uuid(),
  number                integer not null unique check (number between 1 and 99),
  name                  text not null,
  kind                  text not null check (kind in ('private', 'shared')),
  active                boolean not null default true,
  private_therapist_id  uuid references public.therapists (id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint rooms_private_therapist_only_for_private check (kind = 'private' or private_therapist_id is null)
);

-- Admin-configurable fixed blocks (default 08-12, 13-17, 18-22), local time.
create table public.block_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint block_templates_order check (end_time > start_time),
  unique (start_time, end_time)
);

-- Weekly recurring reservation. Concrete rows are generated into room_blocks.
create table public.block_series (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.rooms (id) on delete restrict,
  therapist_id       uuid not null references public.therapists (id) on delete restrict,
  block_template_id  uuid not null references public.block_templates (id) on delete restrict,
  weekday            smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday
  starts_on          date not null,
  ends_on            date,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint block_series_dates check (ends_on is null or ends_on >= starts_on)
);

create table public.room_blocks (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.rooms (id) on delete restrict,
  therapist_id       uuid not null references public.therapists (id) on delete restrict,
  period             tstzrange not null,
  series_id          uuid references public.block_series (id) on delete set null,
  series_occurrence  date,
  status             text not null default 'reserved' check (status in ('reserved', 'released')),
  reserved_by        uuid references public.profiles (id) on delete set null,
  released_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint room_blocks_period_valid check (
    not isempty(period) and lower_inc(period) and not upper_inc(period)
    and not lower_inf(period) and not upper_inf(period)
    and upper(period) - lower(period) <= interval '24 hours'
  ),
  constraint room_blocks_no_overlap
    exclude using gist (room_id with =, period with &&) where (status = 'reserved'),
  constraint room_blocks_series_occurrence_key unique (series_id, series_occurrence)
);
create index room_blocks_therapist_idx on public.room_blocks (therapist_id, lower(period));

-- Working hours for private-room therapists (local time).
create table public.availability_rules (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.therapists (id) on delete cascade,
  weekday       smallint not null check (weekday between 1 and 7),
  start_time    time not null,
  end_time      time not null,
  valid_from    date,
  valid_until   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint availability_rules_order check (end_time > start_time),
  constraint availability_rules_dates check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create index availability_rules_therapist_idx on public.availability_rules (therapist_id);

create table public.time_off (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.therapists (id) on delete cascade,
  period        tstzrange not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint time_off_period_valid check (not isempty(period) and not lower_inf(period) and not upper_inf(period))
);
create index time_off_therapist_idx on public.time_off using gist (therapist_id, period);

-- Admin-opened windows for paper-calendar therapists (MASTER_PROMPT 3.5).
create table public.paper_windows (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.therapists (id) on delete restrict,
  room_id       uuid not null references public.rooms (id) on delete restrict,
  period        tstzrange not null,
  status        text not null default 'open' check (status in ('open', 'filled', 'closed')),
  opened_by     uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint paper_windows_period_valid check (
    not isempty(period) and lower_inc(period) and not upper_inc(period)
    and not lower_inf(period) and not upper_inf(period)
  ),
  constraint paper_windows_no_overlap
    exclude using gist (therapist_id with =, period with &&) where (status <> 'closed')
);

create table public.appointments (
  id                      uuid primary key default gen_random_uuid(),
  therapist_id            uuid not null references public.therapists (id) on delete restrict,
  room_id                 uuid not null references public.rooms (id) on delete restrict,
  room_block_id           uuid references public.room_blocks (id) on delete set null,  -- set by trigger
  paper_window_id         uuid references public.paper_windows (id) on delete set null,
  client_id               uuid not null references public.clients (id) on delete restrict,
  service_id              uuid not null references public.services (id) on delete restrict,
  session_type_id         uuid not null references public.session_types (id) on delete restrict,
  -- session_period = the session itself; period = session + buffer (computed by trigger)
  session_period          tstzrange not null,
  period                  tstzrange not null,
  status                  text not null default 'held'
                            check (status in ('held', 'confirmed', 'cancelled', 'no_show', 'completed')),
  hold_expires_at         timestamptz,
  source                  text not null default 'online' check (source in ('online', 'manual')),
  -- snapshot at booking (D6): later catalogue changes never alter these
  service_name_nl         text not null,
  service_name_en         text not null,
  session_type_name_nl    text not null,
  session_type_name_en    text not null,
  duration_min            integer not null check (duration_min > 0),
  buffer_min              integer not null check (buffer_min >= 0),
  price_cents             integer not null check (price_cents >= 0),
  deposit_cents           integer not null check (deposit_cents >= 0),
  btw_treatment           text check (btw_treatment in ('21', '9', 'exempt')),
  exemption_ground        text,
  cancellation_policy     jsonb,
  is_new_client           boolean,
  client_locale           text not null default 'nl' check (client_locale in ('nl', 'en')),
  cancelled_at            timestamptz,
  cancelled_by            uuid references public.profiles (id) on delete set null,
  cancel_reason           text check (cancel_reason in ('client', 'therapist', 'admin', 'hold_expired')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint appointments_session_period_valid check (
    not isempty(session_period) and lower_inc(session_period) and not upper_inc(session_period)
    and not lower_inf(session_period) and not upper_inf(session_period)
  ),
  constraint appointments_duration_matches check (
    upper(session_period) - lower(session_period) = make_interval(mins => duration_min)
  ),
  constraint appointments_period_includes_buffer check (
    lower(period) = lower(session_period)
    and upper(period) - upper(session_period) = make_interval(mins => buffer_min)
  ),
  constraint appointments_hold_has_expiry check (status <> 'held' or hold_expires_at is not null),
  -- online bookings always carry a deposit of at least EUR 1 (decision 2)
  constraint appointments_online_deposit_min check (source = 'manual' or deposit_cents >= 100),
  constraint appointments_no_therapist_overlap
    exclude using gist (therapist_id with =, period with &&) where (status in ('held', 'confirmed')),
  constraint appointments_no_room_overlap
    exclude using gist (room_id with =, period with &&) where (status in ('held', 'confirmed'))
);
create index appointments_therapist_idx on public.appointments (therapist_id, lower(period));
create index appointments_client_idx on public.appointments (client_id);
create index appointments_room_block_idx on public.appointments (room_block_id);
create index appointments_held_idx on public.appointments (hold_expires_at) where status = 'held';

-- Booking window (MASTER_PROMPT 3.4, parked: table only, no UI).
create table public.booking_rules (
  id                  uuid primary key default gen_random_uuid(),
  therapist_id        uuid not null unique references public.therapists (id) on delete cascade,
  min_notice_minutes  integer not null default 0 check (min_notice_minutes >= 0),
  max_horizon_days    integer check (max_horizon_days is null or max_horizon_days > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Rooms: admin may reconfigure, but never in a way that strands future bookings.
create or replace function public.rooms_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.kind = 'private' and old.kind = 'shared'
     and exists (select 1 from public.room_blocks b
                  where b.room_id = new.id and b.status = 'reserved' and upper(b.period) > now()) then
    raise exception 'room % still has future reserved blocks; release them before making it private', new.number
      using errcode = 'TH004';
  end if;
  if old.kind = 'private' and (new.kind = 'shared' or new.private_therapist_id is distinct from old.private_therapist_id)
     and exists (select 1 from public.appointments a
                  where a.room_id = new.id and a.status in ('held', 'confirmed') and upper(a.period) > now()) then
    raise exception 'room % has future appointments of its current therapist; move or cancel them first', new.number
      using errcode = 'TH004';
  end if;
  if old.active and not new.active
     and (exists (select 1 from public.room_blocks b
                   where b.room_id = new.id and b.status = 'reserved' and upper(b.period) > now())
          or exists (select 1 from public.appointments a
                      where a.room_id = new.id and a.status in ('held', 'confirmed') and upper(a.period) > now())) then
    raise exception 'room % has future blocks or appointments; it cannot be deactivated yet', new.number
      using errcode = 'TH004';
  end if;
  return new;
end;
$$;

create trigger trg_rooms_validate
  before update on public.rooms
  for each row execute function public.rooms_validate();

-- Block series: shared, active room and an active template.
create or replace function public.block_series_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.rooms r where r.id = new.room_id and r.kind = 'shared' and r.active) then
    raise exception 'block series need an active shared room' using errcode = 'TH006';
  end if;
  if not exists (select 1 from public.block_templates t where t.id = new.block_template_id and t.active) then
    raise exception 'block template is not active' using errcode = 'TH006';
  end if;
  return new;
end;
$$;

create trigger trg_block_series_validate
  before insert or update on public.block_series
  for each row execute function public.block_series_validate();

-- Room blocks, step 1 (runs as the caller): extra rules when a therapist acts.
-- Admin and server may override (custom periods, past corrections).
create or replace function public.room_blocks_therapist_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_context() or coalesce(public.auth_role(), '') <> 'therapist' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if lower(old.period) <= now() then
      raise exception 'blocks that have started cannot be deleted' using errcode = 'TH009';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if lower(new.period) <= now() then
      raise exception 'blocks can only be reserved in the future' using errcode = 'TH009';
    end if;
    if new.status <> 'reserved' then
      raise exception 'new blocks must be reserved' using errcode = 'TH006';
    end if;
    if not exists (
      select 1 from public.block_templates bt
       where bt.active
         and (lower(new.period) at time zone 'Europe/Amsterdam')::time = bt.start_time
         and (upper(new.period) at time zone 'Europe/Amsterdam')::time = bt.end_time
         and (lower(new.period) at time zone 'Europe/Amsterdam')::date
             = (upper(new.period) at time zone 'Europe/Amsterdam')::date
    ) then
      raise exception 'a block must match one of the block templates' using errcode = 'TH006';
    end if;
    new.reserved_by := public.current_profile_id();
    return new;
  end if;

  -- UPDATE
  if lower(old.period) <= now() then
    raise exception 'blocks that have started cannot be changed' using errcode = 'TH009';
  end if;
  if new.room_id is distinct from old.room_id
     or new.period is distinct from old.period
     or new.therapist_id is distinct from old.therapist_id
     or new.series_id is distinct from old.series_id
     or new.series_occurrence is distinct from old.series_occurrence then
    raise exception 'release this block and reserve a new one instead' using errcode = 'TH005';
  end if;
  return new;
end;
$$;

-- Room blocks, step 2 (definer): room must be shared & active; never strand appointments.
create or replace function public.room_blocks_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.appointments a
                where a.room_block_id = old.id and a.status in ('held', 'confirmed')) then
      raise exception 'block has held/confirmed appointments; move or cancel them first'
        using errcode = 'TH004';
    end if;
    return old;
  end if;

  if new.status = 'reserved'
     and (tg_op = 'INSERT'
          or row(new.room_id, new.status) is distinct from row(old.room_id, old.status)) then
    if not exists (select 1 from public.rooms r where r.id = new.room_id and r.kind = 'shared' and r.active) then
      raise exception 'blocks can only be reserved in an active shared room' using errcode = 'TH006';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'released' and old.status = 'reserved' then
      new.released_at := coalesce(new.released_at, now());
    elsif new.status = 'reserved' then
      new.released_at := null;
    end if;

    if exists (
      select 1 from public.appointments a
       where a.room_block_id = old.id
         and a.status in ('held', 'confirmed')
         and not (new.status = 'reserved'
                  and new.room_id = a.room_id
                  and new.therapist_id = a.therapist_id
                  and new.period @> a.period)
    ) then
      raise exception 'block has held/confirmed appointments; move or cancel them first'
        using errcode = 'TH004';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_room_blocks_1_guard
  before insert or update or delete on public.room_blocks
  for each row execute function public.room_blocks_therapist_guard();

create trigger trg_room_blocks_2_validate
  before insert or update or delete on public.room_blocks
  for each row execute function public.room_blocks_validate();

-- Paper windows (Q3 default): in a shared room the window must sit inside a block
-- the therapist holds; in a private room it must be that therapist's room.
create or replace function public.paper_windows_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if new.status = 'closed' then
    return new;
  end if;
  select * into v_room from public.rooms r where r.id = new.room_id;
  if not found or not v_room.active then
    raise exception 'paper window needs an active room' using errcode = 'TH006';
  end if;
  if v_room.kind = 'shared' then
    if not exists (select 1 from public.room_blocks b
                    where b.room_id = new.room_id and b.therapist_id = new.therapist_id
                      and b.status = 'reserved' and b.period @> new.period) then
      raise exception 'paper window must lie inside a reserved block of this therapist' using errcode = 'TH001';
    end if;
  elsif v_room.private_therapist_id is distinct from new.therapist_id then
    raise exception 'private room % is not assigned to this therapist', v_room.number using errcode = 'TH002';
  end if;
  return new;
end;
$$;

create trigger trg_paper_windows_validate
  before insert or update on public.paper_windows
  for each row execute function public.paper_windows_validate();

-- Appointments, step 1: snapshot terms (D6) and compute period = session + buffer.
create or replace function public.appointments_prepare()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_st      public.session_types;
  v_svc     public.services;
  v_buffer  integer;
  v_policy  jsonb;
begin
  if tg_op = 'INSERT'
     or new.session_type_id is distinct from old.session_type_id
     or new.therapist_id is distinct from old.therapist_id
     or new.service_id is distinct from old.service_id then
    select * into v_st from public.session_types st where st.id = new.session_type_id;
    if not found then
      raise exception 'unknown session type' using errcode = 'TH008';
    end if;
    select * into v_svc from public.services s where s.id = v_st.service_id;
    if v_svc.therapist_id is distinct from new.therapist_id then
      raise exception 'session type does not belong to this therapist' using errcode = 'TH008';
    end if;
    if new.service_id is null then
      new.service_id := v_svc.id;
    elsif new.service_id <> v_svc.id then
      raise exception 'session type does not belong to this service' using errcode = 'TH008';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select t.buffer_minutes into v_buffer from public.therapists t where t.id = new.therapist_id;
    select to_jsonb(cp) - array['id', 'therapist_id', 'created_at', 'updated_at']
      into v_policy
      from public.cancellation_policies cp where cp.therapist_id = new.therapist_id;

    new.service_name_nl      := coalesce(new.service_name_nl, v_svc.name_nl);
    new.service_name_en      := coalesce(new.service_name_en, v_svc.name_en);
    new.session_type_name_nl := coalesce(new.session_type_name_nl, v_st.name_nl);
    new.session_type_name_en := coalesce(new.session_type_name_en, v_st.name_en);
    new.duration_min         := coalesce(new.duration_min, v_st.duration_min);
    new.price_cents          := coalesce(new.price_cents, v_st.price_cents);
    new.buffer_min           := coalesce(new.buffer_min, v_buffer, 0);
    new.btw_treatment        := coalesce(new.btw_treatment, v_svc.btw_treatment);
    new.exemption_ground     := coalesce(new.exemption_ground, v_svc.exemption_ground);
    new.cancellation_policy  := coalesce(new.cancellation_policy, v_policy);
    if new.deposit_cents is null then
      if new.source = 'manual' then
        new.deposit_cents := 0;
      elsif v_svc.deposit_type = 'fixed' then
        new.deposit_cents := v_svc.deposit_value;
      else
        -- percentage deposit, never below the EUR 1 minimum (decision 2)
        new.deposit_cents := greatest(100, round(new.price_cents * v_svc.deposit_value / 100.0)::integer);
      end if;
    end if;
  end if;

  new.period := tstzrange(lower(new.session_period),
                          upper(new.session_period) + make_interval(mins => new.buffer_min),
                          '[)');

  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  return new;
end;
$$;

-- Appointments, step 2: the room layer must allow this appointment.
create or replace function public.appointments_check_room()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_room    public.rooms;
  v_block   uuid;
  v_window  public.paper_windows;
begin
  if new.status not in ('held', 'confirmed') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('held', 'confirmed')
     and row(new.period, new.room_id, new.therapist_id, new.paper_window_id)
         is not distinct from row(old.period, old.room_id, old.therapist_id, old.paper_window_id) then
    return new;  -- nothing that affects the room layer changed
  end if;

  select * into v_room from public.rooms r where r.id = new.room_id;
  if not found or not v_room.active then
    raise exception 'room is not active' using errcode = 'TH006';
  end if;

  if v_room.kind = 'shared' then
    -- FOR SHARE: a concurrent release of this block waits for us (and then sees us).
    select b.id into v_block
      from public.room_blocks b
     where b.room_id = new.room_id
       and b.therapist_id = new.therapist_id
       and b.status = 'reserved'
       and b.period @> new.period
     for share;
    if v_block is null then
      raise exception 'appointment (incl. buffer) must lie inside a reserved block of this therapist in room %', v_room.number
        using errcode = 'TH001';
    end if;
    new.room_block_id := v_block;
  else
    if v_room.private_therapist_id is distinct from new.therapist_id then
      raise exception 'private room % is not assigned to this therapist', v_room.number
        using errcode = 'TH002';
    end if;
    new.room_block_id := null;
  end if;

  if new.paper_window_id is not null then
    select * into v_window from public.paper_windows w where w.id = new.paper_window_id for update;
    if not found
       or v_window.status = 'closed'
       or v_window.therapist_id <> new.therapist_id
       or v_window.room_id <> new.room_id
       or not (v_window.period @> new.session_period)
       or exists (select 1 from public.appointments a
                   where a.paper_window_id = new.paper_window_id
                     and a.id <> new.id
                     and a.status in ('held', 'confirmed')) then
      raise exception 'paper window is not available' using errcode = 'TH007';
    end if;
  end if;
  return new;
end;
$$;

-- Appointments, step 3 (after): a paper window closes once booked, reopens if freed.
create or replace function public.appointments_sync_paper_window()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.paper_window_id is null and (tg_op = 'INSERT' or old.paper_window_id is null) then
    return null;
  end if;
  update public.paper_windows w
     set status = case when exists (select 1 from public.appointments a
                                     where a.paper_window_id = w.id
                                       and a.status in ('held', 'confirmed'))
                       then 'filled' else 'open' end
   where w.status <> 'closed'
     and w.id in (new.paper_window_id, case when tg_op = 'UPDATE' then old.paper_window_id end);
  return null;
end;
$$;

create trigger trg_appointments_1_prepare
  before insert or update on public.appointments
  for each row execute function public.appointments_prepare();

create trigger trg_appointments_2_check_room
  before insert or update on public.appointments
  for each row execute function public.appointments_check_room();

create trigger trg_appointments_3_paper_window
  after insert or update of status, paper_window_id on public.appointments
  for each row
  execute function public.appointments_sync_paper_window();

-- =============================================================================
-- Functions
-- =============================================================================

-- Cancel unpaid holds whose checkout time ran out (D5). Called by pg_cron every
-- minute and at the start of each booking transaction. Server only.
create or replace function public.expire_stale_holds(p_therapist_id uuid default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.appointments
     set status = 'cancelled', cancel_reason = 'hold_expired', cancelled_at = now()
   where status = 'held'
     and hold_expires_at <= now()
     and (p_therapist_id is null or therapist_id = p_therapist_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Generate concrete room_blocks for a weekly series up to p_until (D3).
-- Local times are converted with Europe/Amsterdam, so DST is handled.
-- Idempotent: an occurrence that already exists (also when released as an
-- exception) or that collides with another therapist's block is skipped.
-- Runs as the caller, so RLS and the therapist guard apply.
-- Returns the number of blocks created.
create or replace function public.materialize_block_series(p_series_id uuid, p_until date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.room_blocks (room_id, therapist_id, period, series_id, series_occurrence, status, reserved_by)
  select s.room_id,
         s.therapist_id,
         tstzrange((d.day + bt.start_time) at time zone 'Europe/Amsterdam',
                   (d.day + bt.end_time) at time zone 'Europe/Amsterdam',
                   '[)'),
         s.id,
         d.day,
         'reserved',
         public.current_profile_id()
    from public.block_series s
    join public.block_templates bt on bt.id = s.block_template_id
    cross join lateral (
      select g::date as day
        from generate_series(s.starts_on::timestamp,
                             least(coalesce(s.ends_on, p_until), p_until)::timestamp,
                             interval '1 day') g
    ) d
   where s.id = p_series_id
     and extract(isodow from d.day) = s.weekday
     and ((d.day + bt.start_time) at time zone 'Europe/Amsterdam') > now()
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
