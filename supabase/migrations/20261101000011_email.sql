-- =============================================================================
-- THNHC platform · 0011 e-mail
-- Confirmation e-mail texts and the e-mail log (demo: src/lib/server/demo/email-store.ts,
-- src/lib/email/outbox.ts).
--  * email_templates gets therapist_id, and service_id may be null: one general message
--    per therapist, plus optional per-treatment messages.
--  * centre_email_settings: one row, centre practical info in every confirmation (admin).
--  * email_log: what was sent, to dedupe confirmations on webhook retries. No content.
-- =============================================================================

alter table public.email_templates add column therapist_id uuid references public.therapists (id) on delete cascade;
update public.email_templates e set therapist_id = s.therapist_id from public.services s where s.id = e.service_id;
alter table public.email_templates alter column therapist_id set not null;
alter table public.email_templates alter column service_id drop not null;
alter table public.email_templates drop constraint if exists email_templates_service_id_kind_key;
create unique index email_templates_general_uq on public.email_templates (therapist_id, kind) where service_id is null;
create unique index email_templates_service_uq on public.email_templates (service_id, kind) where service_id is not null;

-- A per-treatment message must belong to the same therapist as the treatment.
create or replace function public.email_templates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_id is not null
     and not exists (select 1 from public.services s where s.id = new.service_id and s.therapist_id = new.therapist_id) then
    raise exception 'email template service belongs to another therapist' using errcode = 'TH011';
  end if;
  return new;
end;
$$;
create trigger email_templates_guard before insert or update on public.email_templates
  for each row execute function public.email_templates_guard();

drop policy if exists therapist_all_own on public.email_templates;
create policy therapist_all_own on public.email_templates for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

create table public.centre_email_settings (
  id          boolean primary key default true check (id),
  info_nl     text not null default '' check (length(info_nl) <= 2000),
  info_en     text not null default '' check (length(info_en) <= 2000),
  updated_at  timestamptz not null default now()
);
insert into public.centre_email_settings (id) values (true);

create table public.email_log (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  appointment_id  uuid references public.appointments (id) on delete set null,
  invoice_id      uuid references public.invoices (id) on delete set null,
  provider        text not null check (provider in ('outbox', 'brevo', 'resend')),
  provider_id     text,
  sent_at         timestamptz not null default now()
);
-- One booking confirmation per appointment, even when the payment webhook is retried.
create unique index email_log_confirmation_once on public.email_log (appointment_id) where kind = 'booking_confirmation';

alter table public.centre_email_settings enable row level security;
alter table public.email_log enable row level security;

create policy admin_all on public.centre_email_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy therapist_select on public.centre_email_settings for select to authenticated
  using ((select public.auth_role()) = 'therapist');
create policy admin_select on public.email_log for select to authenticated using ((select public.is_admin()));
-- email_log is written by the server (service role) only.

create policy require_mfa on public.centre_email_settings as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy require_mfa on public.email_log as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
