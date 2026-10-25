-- =============================================================================
-- THNHC platform · 0002 people & access
-- profiles, therapists, therapist_business, clients + auth helper functions.
-- =============================================================================

-- One profile per Supabase auth user. role is the single source of truth for access.
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  role        text not null default 'client' check (role in ('admin', 'therapist', 'client')),
  locale      text not null default 'nl' check (locale in ('nl', 'en')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Therapists (= renters of rooms; managed by admin in the admin portal).
-- profile_id is null until the therapist accepts the invite (or for paper-calendar
-- therapists who never log in).
create table public.therapists (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid unique references public.profiles (id) on delete set null,
  slug                   text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name           text not null check (length(btrim(display_name)) > 0),
  bio_nl                 text,
  bio_en                 text,
  photo_path             text,
  public_email           text,
  active                 boolean not null default true,   -- renter still with the centre
  bookable               boolean not null default false,  -- set by admin/server when checklist complete
  onboarding_status      text not null default 'invited'
                           check (onboarding_status in ('invited', 'in_progress', 'complete')),
  paper_calendar         boolean not null default false,
  buffer_minutes         integer not null default 0
                           check (buffer_minutes between 0 and 480 and buffer_minutes % 5 = 0),
  reminder_hours         integer not null default 24 check (reminder_hours between 0 and 720),
  -- null = keep until manually deleted; default 12 months
  intake_retention_days  integer default 365
                           check (intake_retention_days is null or intake_retention_days between 1 and 3650),
  intake_delivery        text not null default 'secure_link'
                           check (intake_delivery in ('secure_link', 'full_email')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Business & tax details. Admin writes, therapist reads (MASTER_PROMPT 4).
create table public.therapist_business (
  id                    uuid primary key default gen_random_uuid(),
  therapist_id          uuid not null unique references public.therapists (id) on delete cascade,
  legal_name            text,
  trade_name            text,
  address_line          text,
  postal_code           text,
  city                  text,
  country               text not null default 'NL' check (country ~ '^[A-Z]{2}$'),
  kvk_number            text check (kvk_number is null or kvk_number ~ '^[0-9]{8}$'),
  btw_number            text check (btw_number is null or btw_number ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'),
  kor                   boolean not null default false,
  -- e.g. [{"register": "RBCZ", "number": "..."}]
  registration_numbers  jsonb not null default '[]'::jsonb check (jsonb_typeof(registration_numbers) = 'array'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Clients. profile_id is null for guests. created_by_therapist_id is set when a
-- therapist enters a phone/paper client (manual booking).
create table public.clients (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid references public.profiles (id) on delete set null,
  created_by_therapist_id  uuid references public.therapists (id) on delete set null,
  first_name               text not null check (length(btrim(first_name)) > 0),
  last_name                text not null,
  email                    text,
  phone                    text,
  date_of_birth            date,
  address_line             text,
  postal_code              text,
  city                     text,
  country                  text check (country is null or country ~ '^[A-Z]{2}$'),
  locale                   text not null default 'nl' check (locale in ('nl', 'en')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index clients_profile_id_key on public.clients (profile_id) where profile_id is not null;
create index clients_email_idx on public.clients (lower(email));
create index clients_created_by_idx on public.clients (created_by_therapist_id);

-- -----------------------------------------------------------------------------
-- Auth helpers. SECURITY DEFINER so policies can use them without recursing
-- into RLS of the tables they read. All return null / empty for anon.
-- -----------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.user_id = auth.uid();
$$;

create or replace function public.auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.user_id = auth.uid()), false);
$$;

create or replace function public.current_therapist_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select t.id
    from public.therapists t
    join public.profiles p on p.id = t.profile_id
   where p.user_id = auth.uid()
     and p.role = 'therapist';
$$;

-- Client rows owned by the logged-in user (normally 0 or 1).
create or replace function public.current_client_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.clients c
    join public.profiles p on p.id = c.profile_id
   where p.user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- New auth user -> profile. Role comes from app_metadata (only the service role
-- can set it, e.g. in the therapist invite flow); everyone else is a client.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role   text := coalesce(new.raw_app_meta_data ->> 'role', 'client');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'nl');
begin
  if v_role not in ('admin', 'therapist', 'client') then
    v_role := 'client';
  end if;
  if v_locale not in ('nl', 'en') then
    v_locale := 'nl';
  end if;
  insert into public.profiles (user_id, role, locale)
  values (new.id, v_role, v_locale)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Guards: identity links and roles can only be changed by the server. This stops
-- an admin (or anyone) from linking themselves to a therapist/client record and
-- thereby gaining access to intake data.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged_context()
     and (new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    raise exception 'profiles.role and profiles.user_id can only be changed by the server'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.therapists_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_context() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.profile_id is not null)
     or (tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id) then
    raise exception 'therapists.profile_id can only be set by the server (invite flow)'
      using errcode = 'TH005';
  end if;
  if tg_op = 'UPDATE' and public.auth_role() = 'therapist'
     and (new.bookable is distinct from old.bookable
          or new.paper_calendar is distinct from old.paper_calendar
          or new.active is distinct from old.active
          or new.slug is distinct from old.slug
          or new.intake_delivery is distinct from old.intake_delivery) then
    -- intake_delivery: "owner may switch" (MASTER_PROMPT 11.2)
    raise exception 'bookable, paper_calendar, active, slug and intake_delivery are managed by the admin'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

create trigger trg_therapists_guard
  before insert or update on public.therapists
  for each row execute function public.therapists_guard();

create or replace function public.clients_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.profile_id is not null and new.profile_id is distinct from public.current_profile_id() then
      raise exception 'a client record can only be linked to your own account'
        using errcode = 'TH005';
    end if;
    if public.auth_role() = 'therapist' then
      new.created_by_therapist_id := public.current_therapist_id();
    elsif new.created_by_therapist_id is not null and not public.is_admin() then
      raise exception 'created_by_therapist_id is set by the system' using errcode = 'TH005';
    end if;
  else
    if new.profile_id is distinct from old.profile_id
       or new.created_by_therapist_id is distinct from old.created_by_therapist_id then
      raise exception 'clients.profile_id / created_by_therapist_id can only be changed by the server'
        using errcode = 'TH005';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_clients_guard
  before insert or update on public.clients
  for each row execute function public.clients_guard();
