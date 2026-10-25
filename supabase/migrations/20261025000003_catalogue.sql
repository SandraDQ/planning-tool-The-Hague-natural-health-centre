-- =============================================================================
-- THNHC platform · 0003 catalogue
-- therapies, services, session_types, cancellation_policies, intake_questions,
-- email_templates. Therapists control their own catalogue; BTW treatment is
-- admin-only (MASTER_PROMPT 4).
-- =============================================================================

create table public.therapies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_nl     text not null,
  name_en     text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  therapist_id      uuid not null references public.therapists (id) on delete restrict,
  therapy_id        uuid not null references public.therapies (id) on delete restrict,
  name_nl           text not null,
  name_en           text not null,
  description_nl    text,
  description_en    text,
  -- fixed: deposit_value in cents (min 100 = EUR 1); percent: whole percent 1..100
  deposit_type      text not null check (deposit_type in ('fixed', 'percent')),
  deposit_value     integer not null,
  -- set by admin (null until the accountant has confirmed it)
  btw_treatment     text check (btw_treatment in ('21', '9', 'exempt')),
  exemption_ground  text,
  sort_order        integer not null default 0,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint services_deposit_valid check (
    (deposit_type = 'fixed' and deposit_value >= 100)
    or (deposit_type = 'percent' and deposit_value between 1 and 100)
  ),
  constraint services_exemption_ground check (
    btw_treatment is distinct from 'exempt' or exemption_ground is not null
  )
);
create index services_therapist_idx on public.services (therapist_id);

create table public.session_types (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services (id) on delete cascade,
  name_nl       text not null,
  name_en       text not null,
  duration_min  integer not null check (duration_min between 5 and 720 and duration_min % 5 = 0),
  price_cents   integer not null check (price_cents >= 0),
  sort_order    integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index session_types_service_idx on public.session_types (service_id);

create table public.cancellation_policies (
  id                  uuid primary key default gen_random_uuid(),
  therapist_id        uuid not null unique references public.therapists (id) on delete cascade,
  notice_value        integer not null default 24 check (notice_value >= 0),
  notice_unit         text not null default 'hours' check (notice_unit in ('hours', 'business_days')),
  -- fixed: cents; percent: whole percent of the session price
  fee_type            text not null default 'percent' check (fee_type in ('fixed', 'percent')),
  fee_value           integer not null default 100 check (fee_value >= 0),
  exempt_new_clients  boolean not null default false,
  text_nl             text,
  text_en             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cancellation_fee_percent check (fee_type <> 'percent' or fee_value <= 100)
);

create table public.intake_questions (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.services (id) on delete cascade,
  label_nl     text not null,
  label_en     text not null,
  type         text not null check (type in ('short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice', 'date', 'number')),
  options      jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  required     boolean not null default false,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index intake_questions_service_idx on public.intake_questions (service_id);

create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services (id) on delete cascade,
  kind        text not null check (kind in ('confirmation', 'what_to_expect', 'reminder')),
  subject_nl  text,
  subject_en  text,
  body_nl     text not null default '',
  body_en     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (service_id, kind)
);

-- BTW treatment is entered by the admin; therapists cannot set or change it.
create or replace function public.services_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_context() or public.is_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.btw_treatment is not null or new.exemption_ground is not null))
     or (tg_op = 'UPDATE' and (new.btw_treatment is distinct from old.btw_treatment
                               or new.exemption_ground is distinct from old.exemption_ground)) then
    raise exception 'BTW treatment of a service is set by the admin' using errcode = 'TH005';
  end if;
  return new;
end;
$$;

create trigger trg_services_guard
  before insert or update on public.services
  for each row execute function public.services_guard();

-- Helpers for policies (SECURITY DEFINER: anon has no column access to therapists).
create or replace function public.is_bookable_therapist(p_therapist_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.therapists t
     where t.id = p_therapist_id and t.bookable and t.active
  );
$$;

create or replace function public.is_public_service(p_service_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.services s
      join public.therapists t on t.id = s.therapist_id
     where s.id = p_service_id and s.archived_at is null and t.bookable and t.active
  );
$$;

create or replace function public.owns_service(p_service_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.services s
     where s.id = p_service_id and s.therapist_id = public.current_therapist_id()
  );
$$;
