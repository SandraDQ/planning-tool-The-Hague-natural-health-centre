-- =============================================================================
-- THNHC platform · 0006 money
-- All amounts are integer cents (EUR). BTW rates are basis points (2100 = 21%).
-- Invoices are immutable once issued (D10); numbers come from a locked
-- per-seller, per-year sequence row, so they are gap-free.
-- Room rent per room is either fixed_monthly or per_block (D12).
-- =============================================================================

-- ---------------------------------------------------------------- room rent --

-- Singleton: room-rent invoicing settings (admin console).
create table public.rent_settings (
  id                 uuid primary key default gen_random_uuid(),
  singleton          boolean not null default true unique check (singleton),
  billing_day        smallint not null default 1 check (billing_day between 1 and 28),
  payment_term_days  smallint not null default 14 check (payment_term_days between 0 and 90),
  auto_send          boolean not null default false,  -- false = admin reviews before sending
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Rent price per room (room_id null = default per-block rate for shared rooms).
-- pricing_mode per room (D12): 'fixed_monthly' (billed to the room's assigned
-- therapist each month) or 'per_block' (each reserved block in the month).
create table public.rent_rates (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid references public.rooms (id) on delete cascade,
  pricing_mode      text not null check (pricing_mode in ('fixed_monthly', 'per_block')),
  per_block_cents   integer check (per_block_cents >= 0),
  monthly_cents     integer check (monthly_cents >= 0),
  btw_treatment     text check (btw_treatment in ('21', '9', 'exempt')),  -- per accountant advice
  exemption_ground  text,
  valid_from        date not null,
  valid_until       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint rent_rates_mode_amounts check (
    (pricing_mode = 'per_block' and per_block_cents is not null and monthly_cents is null)
    or (pricing_mode = 'fixed_monthly' and monthly_cents is not null and per_block_cents is null and room_id is not null)
  ),
  constraint rent_rates_dates check (valid_until is null or valid_until >= valid_from),
  constraint rent_rates_exemption_ground check (btw_treatment is distinct from 'exempt' or exemption_ground is not null),
  -- one rate per room at any date
  constraint rent_rates_no_overlap exclude using gist (
    (coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(valid_from, valid_until, '[]') with &&
  )
);

create table public.rent_runs (
  id             uuid primary key default gen_random_uuid(),
  month          date not null unique check (extract(day from month) = 1),
  status         text not null default 'draft' check (status in ('draft', 'in_review', 'sent', 'failed')),
  moneybird_ids  jsonb not null default '[]'::jsonb,
  created_by     uuid references public.profiles (id) on delete set null,
  sent_at        timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------- invoices --

-- Locked row per seller and year. seller_therapist_id is null for the centre.
create table public.invoice_sequences (
  id                   uuid primary key default gen_random_uuid(),
  seller_type          text not null check (seller_type in ('therapist', 'centre')),
  seller_therapist_id  uuid references public.therapists (id) on delete restrict,
  year                 integer not null check (year between 2000 and 2200),
  last_number          integer not null default 0 check (last_number >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint invoice_sequences_seller check ((seller_type = 'therapist') = (seller_therapist_id is not null)),
  constraint invoice_sequences_seller_year_key unique nulls not distinct (seller_type, seller_therapist_id, year)
);

create table public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  seller_type          text not null check (seller_type in ('therapist', 'centre')),
  seller_therapist_id  uuid references public.therapists (id) on delete restrict,
  kind                 text not null check (kind in ('deposit', 'final', 'credit_note', 'room_rent')),
  status               text not null default 'draft' check (status in ('draft', 'issued')),
  number               text,       -- e.g. 2026-0007, set by issue_invoice()
  sequence_year        integer,
  sequence_number      integer check (sequence_number > 0),
  appointment_id       uuid references public.appointments (id) on delete restrict,
  credited_invoice_id  uuid references public.invoices (id) on delete restrict,
  rent_run_id          uuid references public.rent_runs (id) on delete restrict,
  buyer_client_id      uuid references public.clients (id) on delete restrict,
  buyer_therapist_id   uuid references public.therapists (id) on delete restrict,
  buyer_snapshot       jsonb not null default '{}'::jsonb,
  seller_snapshot      jsonb not null default '{}'::jsonb,
  locale               text not null default 'nl' check (locale in ('nl', 'en')),
  issued_at            timestamptz,
  due_on               date,
  pdf_path             text,       -- may be set once after issue
  sent_at              timestamptz, -- may be set once after issue
  external_ref         text,       -- e.g. Moneybird id
  subtotal_cents       integer not null default 0,
  btw_cents            integer not null default 0,
  total_cents          integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint invoices_seller check ((seller_type = 'therapist') = (seller_therapist_id is not null)),
  constraint invoices_centre_only_rent check ((seller_type = 'centre') = (kind = 'room_rent')),
  constraint invoices_rent_buyer check (kind <> 'room_rent' or buyer_therapist_id is not null),
  constraint invoices_client_buyer check (kind not in ('deposit', 'final') or (appointment_id is not null and buyer_client_id is not null)),
  constraint invoices_credit_ref check ((kind = 'credit_note') = (credited_invoice_id is not null)),
  constraint invoices_issued_complete check (
    status <> 'issued' or (number is not null and issued_at is not null and sequence_number is not null and sequence_year is not null)
  ),
  constraint invoices_totals check (total_cents = subtotal_cents + btw_cents),
  constraint invoices_sign check ((kind = 'credit_note' and total_cents <= 0) or (kind <> 'credit_note' and total_cents >= 0))
);
create unique index invoices_seller_number_key
  on public.invoices (seller_type, coalesce(seller_therapist_id, '00000000-0000-0000-0000-000000000000'::uuid), number)
  where number is not null;
create unique index invoices_seller_sequence_key
  on public.invoices (seller_type, coalesce(seller_therapist_id, '00000000-0000-0000-0000-000000000000'::uuid), sequence_year, sequence_number)
  where sequence_number is not null;
create index invoices_buyer_client_idx on public.invoices (buyer_client_id);
create index invoices_appointment_idx on public.invoices (appointment_id);

create table public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices (id) on delete cascade,
  position          integer not null default 1,
  description       text not null,
  quantity          integer not null default 1 check (quantity <> 0),
  unit_cents        integer not null,           -- excl. BTW; negative on credit notes
  line_total_cents  integer not null,           -- quantity * unit_cents, excl. BTW
  btw_treatment     text not null check (btw_treatment in ('21', '9', 'exempt')),
  btw_rate_bp       integer not null check (btw_rate_bp between 0 and 10000),
  btw_cents         integer not null,
  exemption_ground  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint invoice_lines_total check (line_total_cents = quantity * unit_cents),
  constraint invoice_lines_exempt check (
    btw_treatment <> 'exempt' or (btw_rate_bp = 0 and btw_cents = 0 and exemption_ground is not null)
  )
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- ----------------------------------------------------------------- payments --

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  appointment_id     uuid not null references public.appointments (id) on delete restrict,
  provider           text not null default 'mollie' check (provider in ('mollie')),
  mollie_payment_id  text not null unique,
  mollie_org_id      text,
  amount_cents       integer not null check (amount_cents >= 100),  -- deposits are at least EUR 1
  currency           text not null default 'EUR' check (currency = 'EUR'),
  status             text not null default 'open'
                       check (status in ('open', 'pending', 'authorized', 'paid', 'canceled', 'expired', 'failed')),
  method             text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_appointment_idx on public.payments (appointment_id);

create table public.refunds (
  id                      uuid primary key default gen_random_uuid(),
  payment_id              uuid not null references public.payments (id) on delete restrict,
  amount_cents            integer not null check (amount_cents > 0),
  mollie_refund_id        text unique,
  reason                  text not null check (reason in ('on_time_cancellation', 'late_cancellation', 'therapist_cancelled', 'other')),
  status                  text not null default 'queued'
                            check (status in ('queued', 'pending', 'processing', 'refunded', 'failed', 'canceled')),
  credit_note_invoice_id  uuid references public.invoices (id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);

create table public.balance_payments (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references public.appointments (id) on delete restrict,
  method            text not null check (method in ('cash', 'pin', 'transfer', 'tikkie')),
  amount_cents      integer not null check (amount_cents > 0),
  paid_on           date not null,
  recorded_by       uuid references public.profiles (id) on delete set null,
  final_invoice_id  uuid references public.invoices (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index balance_payments_appointment_idx on public.balance_payments (appointment_id);

-- Webhook idempotency (Mollie and others).
create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  event_id        text not null,
  payload_sha256  text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, event_id)
);

-- =============================================================================
-- Invoice integrity
-- =============================================================================

-- Gap-free number: the UPDATE locks the seller's row until the transaction
-- ends; a rollback also rolls back the increment, so no number is lost.
create or replace function public.next_invoice_number(p_seller_type text, p_seller_therapist_id uuid, p_year integer)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  insert into public.invoice_sequences (seller_type, seller_therapist_id, year, last_number)
  values (p_seller_type, p_seller_therapist_id, p_year, 0)
  on conflict on constraint invoice_sequences_seller_year_key do nothing;

  update public.invoice_sequences
     set last_number = last_number + 1
   where seller_type = p_seller_type
     and seller_therapist_id is not distinct from p_seller_therapist_id
     and year = p_year
  returning last_number into v_number;
  return v_number;
end;
$$;

-- Issue a draft: freeze totals from its lines, take the next number, snapshot
-- seller/buyer details if not given. Server only (service role).
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv       public.invoices;
  v_credited  public.invoices;
  v_year      integer := extract(year from (now() at time zone 'Europe/Amsterdam'))::integer;
  v_number    integer;
  v_subtotal  integer;
  v_btw       integer;
  v_seller    jsonb;
  v_buyer     jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'invoice % is already issued', v_inv.number using errcode = 'TH003';
  end if;

  select coalesce(sum(l.line_total_cents), 0), coalesce(sum(l.btw_cents), 0), count(*)::integer
    into v_subtotal, v_btw, v_number
    from public.invoice_lines l where l.invoice_id = p_invoice_id;
  if v_number = 0 then
    raise exception 'invoice has no lines' using errcode = 'TH010';
  end if;

  if v_inv.kind = 'credit_note' then
    select * into v_credited from public.invoices where id = v_inv.credited_invoice_id;
    if v_credited.status <> 'issued'
       or v_credited.seller_type <> v_inv.seller_type
       or v_credited.seller_therapist_id is distinct from v_inv.seller_therapist_id then
      raise exception 'a credit note must refer to an issued invoice of the same seller' using errcode = 'TH010';
    end if;
  end if;

  v_seller := v_inv.seller_snapshot;
  if v_seller = '{}'::jsonb and v_inv.seller_type = 'therapist' then
    select jsonb_build_object(
             'display_name', t.display_name, 'legal_name', b.legal_name, 'trade_name', b.trade_name,
             'address_line', b.address_line, 'postal_code', b.postal_code, 'city', b.city,
             'country', b.country, 'kvk_number', b.kvk_number, 'btw_number', b.btw_number,
             'kor', b.kor, 'registration_numbers', b.registration_numbers, 'email', t.public_email)
      into v_seller
      from public.therapists t
      left join public.therapist_business b on b.therapist_id = t.id
     where t.id = v_inv.seller_therapist_id;
  end if;

  v_buyer := v_inv.buyer_snapshot;
  if v_buyer = '{}'::jsonb and v_inv.buyer_client_id is not null then
    select jsonb_build_object(
             'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email,
             'address_line', c.address_line, 'postal_code', c.postal_code, 'city', c.city, 'country', c.country)
      into v_buyer
      from public.clients c where c.id = v_inv.buyer_client_id;
  end if;

  v_number := public.next_invoice_number(v_inv.seller_type, v_inv.seller_therapist_id, v_year);

  perform set_config('thnhc.issuing_invoice', p_invoice_id::text, true);
  update public.invoices
     set status          = 'issued',
         issued_at       = now(),
         sequence_year   = v_year,
         sequence_number = v_number,
         number          = v_year::text || '-' || lpad(v_number::text, 4, '0'),
         subtotal_cents  = v_subtotal,
         btw_cents       = v_btw,
         total_cents     = v_subtotal + v_btw,
         seller_snapshot = coalesce(v_seller, '{}'::jsonb),
         buyer_snapshot  = coalesce(v_buyer, '{}'::jsonb)
   where id = p_invoice_id
  returning * into v_inv;
  perform set_config('thnhc.issuing_invoice', '', true);
  return v_inv.number;
end;
$$;

-- Immutable after issue. Only pdf_path and sent_at may be filled in once.
-- The only way to issue is issue_invoice().
create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ignored constant text[] := array['pdf_path', 'sent_at', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'issued invoice % cannot be deleted; issue a credit note instead', old.number
        using errcode = 'TH003';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.number is not null or new.sequence_number is not null then
      raise exception 'invoices are created as drafts and numbered by issue_invoice()' using errcode = 'TH003';
    end if;
    return new;
  end if;

  if old.status = 'issued' then
    if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored)
       or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
       or (old.sent_at is not null and new.sent_at is distinct from old.sent_at) then
      raise exception 'issued invoice % is immutable; corrections only via a credit note', old.number
        using errcode = 'TH003';
    end if;
    return new;
  end if;

  -- draft
  if new.status = 'issued' then
    if coalesce(current_setting('thnhc.issuing_invoice', true), '') <> new.id::text then
      raise exception 'invoices can only be issued through issue_invoice()' using errcode = 'TH003';
    end if;
  elsif new.number is not null or new.sequence_number is not null then
    raise exception 'draft invoices have no number' using errcode = 'TH003';
  end if;
  return new;
end;
$$;

create trigger trg_invoices_guard
  before insert or update or delete on public.invoices
  for each row execute function public.invoices_guard();

create or replace function public.invoice_lines_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select i.status into v_status
    from public.invoices i
   where i.id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  if v_status = 'issued'
     or (tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id
         and exists (select 1 from public.invoices i where i.id = old.invoice_id and i.status = 'issued')) then
    raise exception 'lines of an issued invoice cannot be changed' using errcode = 'TH003';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_guard();

-- Refunds can never exceed the payment they refund.
create or replace function public.refunds_validate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_paid      integer;
  v_refunded  integer;
begin
  select p.amount_cents into v_paid from public.payments p where p.id = new.payment_id for update;
  select coalesce(sum(r.amount_cents), 0) into v_refunded
    from public.refunds r
   where r.payment_id = new.payment_id and r.id <> new.id and r.status not in ('failed', 'canceled');
  if new.status not in ('failed', 'canceled') and v_refunded + new.amount_cents > v_paid then
    raise exception 'refunds (% + %) exceed payment (%)', v_refunded, new.amount_cents, v_paid
      using errcode = 'TH010';
  end if;
  return new;
end;
$$;

create trigger trg_refunds_validate
  before insert or update on public.refunds
  for each row execute function public.refunds_validate();

-- recorded_by is always the caller.
create or replace function public.balance_payments_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged_context() then
    new.recorded_by := public.current_profile_id();
  end if;
  return new;
end;
$$;

create trigger trg_balance_payments_prepare
  before insert on public.balance_payments
  for each row execute function public.balance_payments_prepare();
