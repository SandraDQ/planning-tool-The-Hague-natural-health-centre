-- =============================================================================
-- THNHC platform · 0005 intake (GDPR special-category data, kept apart)
--
-- * Only the treating therapist and the client can read an intake. The admin
--   has NO policy on intakes or intake_access_log (MASTER_PROMPT 2, 11.2).
-- * delete_after is set from the therapist's retention setting; the daily
--   purge_expired_intakes() job deletes expired rows and writes deletion_log.
-- * Invoices/payments are not linked to intakes, so deleting an intake never
--   touches financial records (kept 7 years).
-- =============================================================================

create table public.intakes (
  id                      uuid primary key default gen_random_uuid(),
  appointment_id          uuid not null unique references public.appointments (id) on delete restrict,
  therapist_id            uuid not null references public.therapists (id) on delete restrict,  -- copied from appointment
  client_id               uuid not null references public.clients (id) on delete restrict,     -- copied from appointment
  answers                 jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  health_data_consent_at  timestamptz not null,
  delete_after            timestamptz,  -- null = keep until manually deleted
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index intakes_therapist_idx on public.intakes (therapist_id);
create index intakes_client_idx on public.intakes (client_id);
create index intakes_delete_after_idx on public.intakes (delete_after) where delete_after is not null;

-- Who opened which intake, when. No intake content is stored here.
create table public.intake_access_log (
  id                uuid primary key default gen_random_uuid(),
  intake_id         uuid not null,          -- no FK: the log outlives the intake
  therapist_id      uuid not null references public.therapists (id) on delete restrict,
  client_id         uuid,
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  action            text not null check (action in ('view', 'download', 'secure_link_opened', 'update')),
  accessed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index intake_access_log_intake_idx on public.intake_access_log (intake_id);

-- Audit of permanent deletions (ids and reasons only, never content).
create table public.deletion_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('intake')),
  entity_id     uuid not null,
  therapist_id  uuid references public.therapists (id) on delete set null,
  reason        text not null check (reason in ('retention_expired', 'manual', 'client_request')),
  deleted_by    uuid references public.profiles (id) on delete set null,  -- null = system job
  deleted_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index deletion_log_entity_idx on public.deletion_log (entity_type, entity_id);

-- Fill therapist/client from the appointment and delete_after from retention.
create or replace function public.intakes_prepare()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_appt       public.appointments;
  v_retention  integer;
begin
  if tg_op = 'INSERT' then
    select * into v_appt from public.appointments a where a.id = new.appointment_id;
    if not found then
      raise exception 'unknown appointment' using errcode = 'TH008';
    end if;
    new.therapist_id := v_appt.therapist_id;
    new.client_id := v_appt.client_id;
    if new.delete_after is null then
      select t.intake_retention_days into v_retention from public.therapists t where t.id = v_appt.therapist_id;
      if v_retention is not null then
        new.delete_after := now() + make_interval(days => v_retention);
      end if;
    end if;
  elsif new.appointment_id is distinct from old.appointment_id
     or new.therapist_id is distinct from old.therapist_id
     or new.client_id is distinct from old.client_id then
    raise exception 'an intake cannot be moved to another appointment, therapist or client'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

create trigger trg_intakes_prepare
  before insert or update on public.intakes
  for each row execute function public.intakes_prepare();

-- Every intake deletion is logged. purge_expired_intakes() sets the reason.
create or replace function public.intakes_log_deletion()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('thnhc.deletion_reason', true), '');
begin
  insert into public.deletion_log (entity_type, entity_id, therapist_id, reason, deleted_by)
  values ('intake', old.id, old.therapist_id, coalesce(v_reason, 'manual'), public.current_profile_id());
  return old;
end;
$$;

create trigger trg_intakes_log_deletion
  after delete on public.intakes
  for each row execute function public.intakes_log_deletion();

-- Daily retention job (pg_cron). Server / cron only.
create or replace function public.purge_expired_intakes()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('thnhc.deletion_reason', 'retention_expired', true);
  delete from public.intakes where delete_after is not null and delete_after <= now();
  get diagnostics v_count = row_count;
  perform set_config('thnhc.deletion_reason', '', true);
  return v_count;
end;
$$;

-- Record that the caller opened an intake. Only the treating therapist or the
-- client themselves can log (and therefore read) it.
create or replace function public.log_intake_access(p_intake_id uuid, p_action text default 'view')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_intake public.intakes;
begin
  select * into v_intake from public.intakes i where i.id = p_intake_id;
  -- coalesce: for callers who are neither therapist nor client the comparisons
  -- are NULL, which must mean "no access"
  if not found
     or not coalesce(v_intake.therapist_id = public.current_therapist_id()
                     or v_intake.client_id = any (public.current_client_ids()), false) then
    raise exception 'intake not found' using errcode = '42501';
  end if;
  insert into public.intake_access_log (intake_id, therapist_id, client_id, actor_profile_id, action)
  values (v_intake.id, v_intake.therapist_id, v_intake.client_id, public.current_profile_id(), p_action);
end;
$$;
