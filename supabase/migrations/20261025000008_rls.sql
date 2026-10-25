-- =============================================================================
-- THNHC platform · 0008 row-level security, grants, updated_at triggers
--
-- Rules (MASTER_PROMPT 2, 11, 15 "Access & privacy"):
--   * RLS is enabled on EVERY table; every table has explicit policies.
--   * admin manages everything EXCEPT intakes / intake_access_log: there is
--     deliberately no admin policy on those two tables.
--   * therapist: only own rows (appointments, own clients, own invoices, own
--     settings); business & tax details read-only.
--   * client: own appointments, invoices, payments, intakes.
--   * anon: bookable therapists' public profile, active services, session
--     types, therapies. Nothing personal.
--   * service_role (server) bypasses RLS; it is the only writer of tokens,
--     webhooks, payments, invoices numbering, intakes.
-- Helper functions are wrapped in (select ...) so they run once per query.
-- =============================================================================

-- ------------------------------------------------------------ enable RLS ----
alter table public.profiles               enable row level security;
alter table public.therapists             enable row level security;
alter table public.therapist_business     enable row level security;
alter table public.clients                enable row level security;
alter table public.therapies              enable row level security;
alter table public.services               enable row level security;
alter table public.session_types          enable row level security;
alter table public.cancellation_policies  enable row level security;
alter table public.intake_questions       enable row level security;
alter table public.email_templates        enable row level security;
alter table public.rooms                  enable row level security;
alter table public.block_templates        enable row level security;
alter table public.block_series           enable row level security;
alter table public.room_blocks            enable row level security;
alter table public.availability_rules     enable row level security;
alter table public.time_off               enable row level security;
alter table public.paper_windows          enable row level security;
alter table public.appointments           enable row level security;
alter table public.booking_rules          enable row level security;
alter table public.intakes                enable row level security;
alter table public.intake_access_log      enable row level security;
alter table public.deletion_log           enable row level security;
alter table public.rent_settings          enable row level security;
alter table public.rent_rates             enable row level security;
alter table public.rent_runs              enable row level security;
alter table public.invoice_sequences      enable row level security;
alter table public.invoices               enable row level security;
alter table public.invoice_lines          enable row level security;
alter table public.payments               enable row level security;
alter table public.refunds                enable row level security;
alter table public.balance_payments       enable row level security;
alter table public.webhook_events         enable row level security;
alter table public.calendar_connections   enable row level security;
alter table public.calendar_feed_tokens   enable row level security;
alter table public.calendar_event_links   enable row level security;
alter table public.external_busy          enable row level security;

-- ------------------------------------------------------- admin: full access --
-- Explicit list. intakes and intake_access_log are intentionally NOT here.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'therapists', 'therapist_business', 'clients',
    'therapies', 'services', 'session_types', 'cancellation_policies', 'intake_questions', 'email_templates',
    'rooms', 'block_templates', 'block_series', 'room_blocks', 'availability_rules', 'time_off',
    'paper_windows', 'appointments', 'booking_rules',
    'rent_settings', 'rent_rates', 'rent_runs', 'invoices', 'invoice_lines',
    'payments', 'refunds', 'balance_payments'
  ] loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated '
      'using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- admin: read-only on audit / system tables (written by triggers or the server)
create policy admin_select on public.deletion_log         for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.invoice_sequences    for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.webhook_events       for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.calendar_connections for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.calendar_feed_tokens for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.calendar_event_links for select to authenticated using ((select public.is_admin()));
create policy admin_select on public.external_busy        for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------- people & access ----
create policy self_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy self_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy public_read_bookable on public.therapists for select to anon, authenticated
  using (bookable and active);
create policy therapist_select_own on public.therapists for select to authenticated
  using (id = (select public.current_therapist_id()));
create policy therapist_update_own on public.therapists for update to authenticated
  using (id = (select public.current_therapist_id()))
  with check (id = (select public.current_therapist_id()));

-- business & tax details: admin writes (admin_all), therapist reads own
create policy therapist_select_own on public.therapist_business for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));

-- clients: own record; therapists see clients they created or treat
create or replace function public.therapist_can_use_client(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.current_therapist_id() is not null and (
    exists (select 1 from public.clients c
             where c.id = p_client_id and c.created_by_therapist_id = public.current_therapist_id())
    or exists (select 1 from public.appointments a
                where a.client_id = p_client_id and a.therapist_id = public.current_therapist_id())
  );
$$;

create policy client_select_own on public.clients for select to authenticated
  using (profile_id = (select public.current_profile_id()));
create policy client_insert_own on public.clients for insert to authenticated
  with check (profile_id = (select public.current_profile_id()) and (select public.auth_role()) = 'client');
create policy client_update_own on public.clients for update to authenticated
  using (profile_id = (select public.current_profile_id()))
  with check (profile_id = (select public.current_profile_id()));
create policy therapist_select_linked on public.clients for select to authenticated
  using (created_by_therapist_id = (select public.current_therapist_id())
         or public.therapist_can_use_client(id));
create policy therapist_insert on public.clients for insert to authenticated
  with check ((select public.current_therapist_id()) is not null
              and created_by_therapist_id = (select public.current_therapist_id())
              and profile_id is null);
create policy therapist_update_created on public.clients for update to authenticated
  using (created_by_therapist_id = (select public.current_therapist_id()))
  with check (created_by_therapist_id = (select public.current_therapist_id()));

-- ------------------------------------------------------------- catalogue ----
create policy public_read_active on public.therapies for select to anon, authenticated
  using (active);

create policy public_read_active on public.services for select to anon, authenticated
  using (archived_at is null and public.is_bookable_therapist(therapist_id));
create policy therapist_all_own on public.services for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

create policy public_read_active on public.session_types for select to anon, authenticated
  using (archived_at is null and public.is_public_service(service_id));
create policy therapist_all_own on public.session_types for all to authenticated
  using (public.owns_service(service_id)) with check (public.owns_service(service_id));

create policy therapist_all_own on public.cancellation_policies for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

create policy therapist_all_own on public.intake_questions for all to authenticated
  using (public.owns_service(service_id)) with check (public.owns_service(service_id));

create policy therapist_all_own on public.email_templates for all to authenticated
  using (public.owns_service(service_id)) with check (public.owns_service(service_id));

-- ----------------------------------------------------------- rooms & time ----
create policy therapist_select on public.rooms for select to authenticated
  using ((select public.auth_role()) = 'therapist');

create policy therapist_select on public.block_templates for select to authenticated
  using ((select public.auth_role()) = 'therapist');

create policy therapist_all_own on public.block_series for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

-- therapists see the whole room grid (who holds which block) to reserve blocks
create policy therapist_select_all on public.room_blocks for select to authenticated
  using ((select public.auth_role()) = 'therapist');
create policy therapist_insert_own on public.room_blocks for insert to authenticated
  with check (therapist_id = (select public.current_therapist_id()));
create policy therapist_update_own on public.room_blocks for update to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));
create policy therapist_delete_own on public.room_blocks for delete to authenticated
  using (therapist_id = (select public.current_therapist_id()));

create policy therapist_all_own on public.availability_rules for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

create policy therapist_all_own on public.time_off for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

create policy therapist_select_own on public.paper_windows for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));

create policy therapist_select_own on public.appointments for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));
-- therapists add manual (phone/paper) bookings for clients they created or treat
create policy therapist_insert_manual on public.appointments for insert to authenticated
  with check (therapist_id = (select public.current_therapist_id())
              and source = 'manual'
              and public.therapist_can_use_client(client_id));
create policy therapist_update_own on public.appointments for update to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id())
              and public.therapist_can_use_client(client_id));
create policy client_select_own on public.appointments for select to authenticated
  using (client_id = any ((select public.current_client_ids())::uuid[]));

create policy therapist_all_own on public.booking_rules for all to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));

-- ---------------------------------------------------------------- intake ----
-- NO admin policy. Inserts come from the server (service role) during booking.
create policy therapist_select_own on public.intakes for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));
create policy therapist_update_own on public.intakes for update to authenticated
  using (therapist_id = (select public.current_therapist_id()))
  with check (therapist_id = (select public.current_therapist_id()));
create policy therapist_delete_own on public.intakes for delete to authenticated
  using (therapist_id = (select public.current_therapist_id()));
create policy client_select_own on public.intakes for select to authenticated
  using (client_id = any ((select public.current_client_ids())::uuid[]));

-- NO admin policy. Rows are written by log_intake_access() only.
create policy therapist_select_own on public.intake_access_log for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));
create policy client_select_own on public.intake_access_log for select to authenticated
  using (client_id = any ((select public.current_client_ids())::uuid[]));

create policy therapist_select_own on public.deletion_log for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));

-- ----------------------------------------------------------------- money ----
-- rent: rates visible to therapists (what they pay); settings and runs admin-only
create policy therapist_select on public.rent_rates for select to authenticated
  using ((select public.auth_role()) = 'therapist');

create policy therapist_select_own on public.invoices for select to authenticated
  using (seller_therapist_id = (select public.current_therapist_id())
         or buyer_therapist_id = (select public.current_therapist_id()));
create policy client_select_own on public.invoices for select to authenticated
  using (status = 'issued' and buyer_client_id = any ((select public.current_client_ids())::uuid[]));

-- lines follow their invoice
create policy select_via_invoice on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id));

-- payments / refunds / balances follow the appointment (therapist or client)
create policy select_via_appointment on public.payments for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = payments.appointment_id));
create policy select_via_payment on public.refunds for select to authenticated
  using (exists (select 1 from public.payments p where p.id = refunds.payment_id));
create policy select_via_appointment on public.balance_payments for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = balance_payments.appointment_id));
create policy therapist_insert_own on public.balance_payments for insert to authenticated
  with check (exists (select 1 from public.appointments a
                       where a.id = balance_payments.appointment_id
                         and a.therapist_id = (select public.current_therapist_id())));

-- ------------------------------------------------------------------ sync ----
create policy owner_select on public.calendar_connections for select to authenticated
  using (profile_id = (select public.current_profile_id()));
create policy owner_delete on public.calendar_connections for delete to authenticated
  using (profile_id = (select public.current_profile_id()));

create policy owner_select on public.calendar_feed_tokens for select to authenticated
  using (profile_id = (select public.current_profile_id()));

create policy owner_select on public.calendar_event_links for select to authenticated
  using (exists (select 1 from public.calendar_connections c
                  where c.id = calendar_event_links.connection_id
                    and c.profile_id = (select public.current_profile_id())));

create policy therapist_select_own on public.external_busy for select to authenticated
  using (therapist_id = (select public.current_therapist_id()));

-- ================================================================ grants ====
-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Defense in depth: anon gets nothing except the public catalogue, and only
-- the public columns of therapists.
revoke all on all tables in schema public from anon;
grant select on public.therapies, public.services, public.session_types to anon;
grant select (id, slug, display_name, bio_nl, bio_en, photo_path, public_email)
  on public.therapists to anon;

-- Tokens are never readable or writable through the API.
revoke select, insert, update on public.calendar_connections from authenticated;
grant select (id, profile_id, provider, external_calendar_id, status, last_error, last_synced_at, created_at, updated_at)
  on public.calendar_connections to authenticated;
revoke select, insert, update on public.calendar_feed_tokens from authenticated;
grant select (id, profile_id, revoked_at, last_used_at, created_at, updated_at)
  on public.calendar_feed_tokens to authenticated;

-- Server-only functions: not callable by anon/authenticated via the API.
revoke execute on function public.purge_expired_intakes() from public, anon, authenticated;
revoke execute on function public.expire_stale_holds(uuid) from public, anon, authenticated;
revoke execute on function public.next_invoice_number(text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.issue_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.purge_expired_intakes() to service_role;
grant execute on function public.expire_stale_holds(uuid) to service_role;
grant execute on function public.next_invoice_number(text, uuid, integer) to service_role;
grant execute on function public.issue_invoice(uuid) to service_role;
-- log_intake_access is for the treating therapist / client only
revoke execute on function public.log_intake_access(uuid, text) from public, anon;
grant execute on function public.log_intake_access(uuid, text) to authenticated, service_role;

-- ============================================================ updated_at ====
do $$
declare
  r record;
begin
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger trg_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', r.table_name);
  end loop;
end;
$$;
