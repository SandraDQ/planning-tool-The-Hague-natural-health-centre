-- =============================================================================
-- THNHC platform · 0007 calendar sync (MASTER_PROMPT 7A)
-- Tokens are stored encrypted by the server (key from env) and are never
-- readable through the API (column privileges in the RLS migration).
-- External busy times are stored without titles.
-- =============================================================================

create table public.calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references public.profiles (id) on delete cascade,  -- therapist or admin
  provider              text not null check (provider in ('google', 'microsoft', 'apple_caldav')),
  external_calendar_id  text,           -- the dedicated "THNHC" calendar we write to
  access_token_enc      bytea,
  refresh_token_enc     bytea,
  token_expires_at      timestamptz,
  status                text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error            text,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (profile_id, provider)
);

-- Signed, revocable ICS feed links. Only the SHA-256 hash of the token is stored.
create table public.calendar_feed_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one active link per person; "reset link" = revoke + insert
create unique index calendar_feed_tokens_one_active
  on public.calendar_feed_tokens (profile_id) where revoked_at is null;

create table public.calendar_event_links (
  id                 uuid primary key default gen_random_uuid(),
  connection_id      uuid not null references public.calendar_connections (id) on delete cascade,
  appointment_id     uuid references public.appointments (id) on delete cascade,
  room_block_id      uuid references public.room_blocks (id) on delete cascade,
  external_event_id  text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint calendar_event_links_one_target check (num_nonnulls(appointment_id, room_block_id) = 1),
  unique (connection_id, external_event_id)
);

-- Busy times read from a therapist's personal calendar. No titles, ever.
create table public.external_busy (
  id                 uuid primary key default gen_random_uuid(),
  therapist_id       uuid not null references public.therapists (id) on delete cascade,
  connection_id      uuid not null references public.calendar_connections (id) on delete cascade,
  period             tstzrange not null,
  external_ref_hash  text not null,   -- hash of the provider's event id, for upserts
  synced_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint external_busy_period_valid check (not isempty(period) and not lower_inf(period) and not upper_inf(period)),
  unique (connection_id, external_ref_hash)
);
create index external_busy_therapist_idx on public.external_busy using gist (therapist_id, period);

-- Hash helper for feed tokens (server computes the token, stores only the hash).
create or replace function public.hash_feed_token(p_token text)
returns text
language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;
