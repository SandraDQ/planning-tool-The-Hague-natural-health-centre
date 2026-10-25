-- =============================================================================
-- THNHC platform · 0010 privacy & security review fixes (Phase 2)
-- See handoffs/reviews/phase2-review.md. Findings F1-F10.
-- =============================================================================

-- ---------------------------------------------------------------- F6 (first) --
-- From here on, new tables, sequences and functions in public are NOT granted to
-- anon/authenticated (or functions to PUBLIC) automatically. Every later
-- migration must grant explicitly what a role needs.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- PUBLIC execute is a global default, so it can only be revoked without IN SCHEMA
alter default privileges revoke execute on functions from public;

-- ------------------------------------------------------------------- F2: 2FA --
-- Admin and therapist access requires a second factor (Supabase AAL2,
-- MASTER_PROMPT 11.1, D17). Clients use magic links only (aal1).
create or replace function public.mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.auth_role(), 'none') not in ('admin', 'therapist')
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
grant execute on function public.mfa_satisfied() to authenticated, service_role;

-- RESTRICTIVE policy on every table: ANDed with all permissive policies.
-- profiles: the own row (role, locale) stays readable at aal1 so the app can
-- tell the user to complete 2FA.
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    if t = 'profiles' then
      execute 'create policy require_mfa on public.profiles as restrictive for all to authenticated '
              'using ((select public.mfa_satisfied()) or user_id = (select auth.uid())) '
              'with check ((select public.mfa_satisfied()))';
    else
      execute format('create policy require_mfa on public.%I as restrictive for all to authenticated '
                     'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', t);
    end if;
  end loop;
end;
$$;

-- --------------------------------------------- F1: admin → intake via client --
-- (a) Only the server may link a client row to an account, and only to a
--     profile with role 'client'.
create or replace function public.clients_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_id is not null
     and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    if not public.is_privileged_context() then
      raise exception 'only the server can link a client record to an account' using errcode = 'TH005';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'client') then
      raise exception 'a client record can only be linked to a client account' using errcode = 'TH005';
    end if;
  end if;

  if public.is_privileged_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.auth_role() = 'therapist' then
      new.created_by_therapist_id := public.current_therapist_id();
    elsif new.created_by_therapist_id is not null and not public.is_admin() then
      raise exception 'created_by_therapist_id is set by the system' using errcode = 'TH005';
    end if;
  elsif new.profile_id is distinct from old.profile_id
     or new.created_by_therapist_id is distinct from old.created_by_therapist_id then
    raise exception 'clients.profile_id / created_by_therapist_id can only be changed by the server'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

-- clients no longer insert their own row through the API (the server links accounts)
drop policy client_insert_own on public.clients;

-- (b) extra belt: only accounts with role 'client' own client rows
create or replace function public.current_client_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.clients c
    join public.profiles p on p.id = c.profile_id
   where p.user_id = auth.uid()
     and p.role = 'client';
$$;

-- (c) who the appointment is for, and with whom, never changes through the API
create or replace function public.appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged_context()
     and (new.client_id is distinct from old.client_id or new.therapist_id is distinct from old.therapist_id) then
    raise exception 'client and therapist of an appointment cannot be changed; cancel and rebook instead'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

create trigger trg_appointments_0_guard
  before update on public.appointments
  for each row execute function public.appointments_guard();

-- ---------------------------------------------------- F3: profiles read-only --
drop policy admin_all on public.profiles;
create policy admin_select on public.profiles for select to authenticated
  using ((select public.is_admin()));

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged_context() then
    return coalesce(new, old);
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'profiles are created and deleted by the server only' using errcode = 'TH005';
  end if;
  if new.role is distinct from old.role or new.user_id is distinct from old.user_id then
    raise exception 'profiles.role and profiles.user_id can only be changed by the server'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

drop trigger trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before insert or update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- ------------------------------------------------ F9: onboarding_status guard --
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
          or new.intake_delivery is distinct from old.intake_delivery    -- 11.2: owner may switch
          or new.onboarding_status is distinct from old.onboarding_status) then
    raise exception 'bookable, paper_calendar, active, slug, intake_delivery and onboarding_status are managed by the admin/server'
      using errcode = 'TH005';
  end if;
  return new;
end;
$$;

-- ------------------------------- F5: early purge of intakes of void bookings --
-- D18: when a hold expires or a booking is cancelled before its session starts,
-- its intake is due for deletion at once (deleted by the next purge run).
create or replace function public.appointments_expire_intake()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and now() < lower(new.session_period) then
    update public.intakes
       set delete_after = now()
     where appointment_id = new.id
       and (delete_after is null or delete_after > now());
  end if;
  return null;
end;
$$;

create trigger trg_appointments_4_expire_intake
  after update of status on public.appointments
  for each row execute function public.appointments_expire_intake();

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
    if v_appt.status = 'cancelled' and now() < lower(v_appt.session_period) then
      new.delete_after := now();  -- D18
    elsif new.delete_after is null then
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

-- ------------------------------------------- F7: deletion reason not spoofable --
-- The purge writes its own 'retention_expired' log rows in the same statement
-- as the delete. The row trigger logs every other deletion as 'manual'.
-- No session setting is involved; deletion_log has no insert policy.
create or replace function public.intakes_log_deletion()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.deletion_log d
                  where d.entity_type = 'intake' and d.entity_id = old.id) then
    insert into public.deletion_log (entity_type, entity_id, therapist_id, reason, deleted_by)
    values ('intake', old.id, old.therapist_id, 'manual', public.current_profile_id());
  end if;
  return old;
end;
$$;

create or replace function public.purge_expired_intakes()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    select i.id, i.therapist_id
      from public.intakes i
     where i.delete_after is not null and i.delete_after <= now()
       for update
  ), logged as (
    insert into public.deletion_log (entity_type, entity_id, therapist_id, reason, deleted_by)
    select 'intake', e.id, e.therapist_id, 'retention_expired', null from expired e
    returning entity_id
  )
  delete from public.intakes i using logged l where i.id = l.entity_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --------------------------------------------- F8: intake content via logging --
-- answers (the health data) is not selectable directly; the treating therapist
-- and the client read it through read_intake(), which writes intake_access_log.
revoke select on public.intakes from authenticated;
grant select (id, appointment_id, therapist_id, client_id, health_data_consent_at, delete_after, created_at, updated_at)
  on public.intakes to authenticated;

create or replace function public.read_intake(p_intake_id uuid)
returns public.intakes
language plpgsql security definer
set search_path = ''
as $$
declare
  v_intake public.intakes;
begin
  select * into v_intake from public.intakes i where i.id = p_intake_id;
  if not found
     or not public.mfa_satisfied()
     or not coalesce(v_intake.therapist_id = public.current_therapist_id()
                     or v_intake.client_id = any (public.current_client_ids()), false) then
    raise exception 'intake not found' using errcode = '42501';
  end if;
  insert into public.intake_access_log (intake_id, therapist_id, client_id, actor_profile_id, action)
  values (v_intake.id, v_intake.therapist_id, v_intake.client_id, public.current_profile_id(), 'view');
  return v_intake;
end;
$$;
revoke execute on function public.read_intake(uuid) from public, anon;
grant execute on function public.read_intake(uuid) to authenticated, service_role;

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
     or not public.mfa_satisfied()
     or not coalesce(v_intake.therapist_id = public.current_therapist_id()
                     or v_intake.client_id = any (public.current_client_ids()), false) then
    raise exception 'intake not found' using errcode = '42501';
  end if;
  insert into public.intake_access_log (intake_id, therapist_id, client_id, actor_profile_id, action)
  values (v_intake.id, v_intake.therapist_id, v_intake.client_id, public.current_profile_id(), p_action);
end;
$$;

-- ------------------------------------------- F10 + F6: tighten existing grants --
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Functions: nothing is executable by PUBLIC/anon except what anon policies need.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_bookable_therapist(uuid) to anon;
grant execute on function public.is_public_service(uuid) to anon;

-- --------------------------------------------- F4: scheduled jobs must exist --
-- Supersedes the soft check in 0009: without pg_cron, intakes would never be
-- purged (legal requirement, 11.2), so the migration fails. Local tests set
-- thnhc.allow_missing_pg_cron=on (scripts/test-db.sh) to skip scheduling.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      create extension pg_cron with schema pg_catalog;
    elsif coalesce(current_setting('thnhc.allow_missing_pg_cron', true), '') = 'on' then
      raise warning 'pg_cron missing: jobs not scheduled (allowed by thnhc.allow_missing_pg_cron, local tests only)';
      return;
    else
      raise exception 'pg_cron is required: intake retention purge and hold expiry depend on it. Enable it in Supabase (Database > Extensions) and re-run.';
    end if;
  end if;
  -- cron.schedule with an existing name updates that job (idempotent)
  execute $sql$select cron.schedule('thnhc-expire-holds', '* * * * *', 'select public.expire_stale_holds()')$sql$;
  execute $sql$select cron.schedule('thnhc-purge-intakes', '15 3 * * *', 'select public.purge_expired_intakes()')$sql$;
end;
$$;

-- Health check for the admin dashboard / MAINTENANCE.md: is each job scheduled,
-- when did it last run, did that succeed within the expected interval?
create or replace function public.job_health()
returns table (job_name text, scheduled boolean, schedule text, last_run_at timestamptz,
               last_status text, max_age interval, healthy boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  -- end users must be an admin with 2FA; the server/cron (no end-user identity) may always call it
  if auth.uid() is not null and not (public.is_admin() and public.mfa_satisfied()) then
    raise exception 'job_health is for the admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return query
      select j.name, false, null::text, null::timestamptz, 'pg_cron not installed'::text, j.max_age, false
        from (values ('thnhc-expire-holds', interval '5 minutes'),
                     ('thnhc-purge-intakes', interval '48 hours')) as j (name, max_age);
    return;
  end if;

  return query execute $q$
    select j.name::text,
           c.jobid is not null,
           c.schedule::text,
           r.start_time,
           r.status::text,
           j.max_age,
           coalesce(c.active and r.status = 'succeeded' and r.start_time > now() - j.max_age, false)
      from (values ('thnhc-expire-holds', interval '5 minutes'),
                   ('thnhc-purge-intakes', interval '48 hours')) as j (name, max_age)
      left join cron.job c on c.jobname = j.name
      left join lateral (
        select d.start_time, d.status from cron.job_run_details d
         where d.jobid = c.jobid order by d.start_time desc limit 1
      ) r on true
  $q$;
end;
$$;
revoke execute on function public.job_health() from public, anon;
grant execute on function public.job_health() to authenticated, service_role;
