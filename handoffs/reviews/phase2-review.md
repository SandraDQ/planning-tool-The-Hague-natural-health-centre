# Phase 2 · privacy & security review

*2026-10-25 · privacy-security-reviewer · branch `claude/project-thread-5fstmm` · nothing committed*

## Verdict: **BLOCK**

One finding breaks a hard rule from MASTER_PROMPT 2, 11.2 and 15 ("Admin cannot open intake data"). The test proves it: R1 in `tests/db/90_review.sql`. A second finding (no 2FA at database level) needs a decision before the gate. Everything else is medium or low and can be fixed in this phase or tracked for later.

`pnpm test:db`: 10 files passed, 0 failed, 275 assertions. That count includes the new `tests/db/90_review.sql` (21 assertions). Tests named `HOLE:` pass **while the hole exists**. Turn each one around when its fix lands.

## Findings

### F1 · HIGH · Admin can read intake data through a client row linked to their own profile
- **Where:** `supabase/migrations/20261025000002_people.sql:236` (clients_guard lets anyone link a *new* client row to their own profile), `…0008_rls.sql:66` (`admin_all` on `appointments`, so `client_id` can be changed), `…0005_intake.sql:71` (intake copies `client_id` from the appointment at insert), `…0008_rls.sql:221` (client policy on intakes).
- **What's wrong:** The admin inserts a `clients` row with `profile_id = current_profile_id()`, then points an upcoming appointment at it. The intake that the server stores for that appointment then belongs to the admin's client row. The admin reads it through `client_select_own`.
- **Failure scenario:** The admin re-points a held booking during checkout, or any booking whose intake is stored or re-stored later. The admin then reads the client's complaint (special-category health data). Proven by `R1 HOLE` in `tests/db/90_review.sql`.
- **Suggested fix (any one closes it, ideally both):**
  1. `clients_guard`: allow a non-null `profile_id` on INSERT only when `auth_role() = 'client'`, because only the server links accounts (in line with D15).
  2. Make `appointments.client_id` and `therapist_id` immutable for non-privileged callers once set, in `appointments_prepare` or a guard trigger. Admin "moves" are period/room changes, not changes of who the client is.
  - Also: the intake client policy could additionally require that the client row was not created by an admin or therapist account (role check in `current_client_ids()`: `p.role = 'client'`).

### F2 · HIGH (decision needed) · RLS does not require a second factor (11.1 2FA)
- **Where:** `…0008_rls.sql` (all policies), e.g. `:214` therapist intake select and the `admin_all` loop at `:58–75`.
- **What's wrong:** No policy checks `auth.jwt() ->> 'aal'`. A therapist or admin session that only passed the magic link (`aal1`) has full rights.
- **Failure scenario:** Someone gets hold of a therapist's mailbox or a forwarded magic link. They log in without TOTP and read that therapist's intakes. Proven by `R3 HOLE`.
- **Suggested fix:** Add **restrictive** policies (`as restrictive … using ((select auth.jwt() ->> 'aal') = 'aal2' or (select public.auth_role()) = 'client')`) on every table for `authenticated`, or at least on intakes, intake_access_log, clients, appointments, invoices and all admin_all tables. Add tests for aal1 vs aal2. If the orchestrator prefers to enforce this in the app (Phase 4/6), record it in DECISIONS.md and add the DB check anyway as defence in depth.

### F3 · MEDIUM · Admin can create, delete and re-create profiles with any role (D15 bypass)
- **Where:** `…0002_people.sql:190–191` (`profiles_guard` is BEFORE UPDATE only), `…0008_rls.sql:63` (`admin_all` on profiles).
- **What's wrong:** D15 says roles change only on the server. The admin can DELETE any profile and INSERT it again with role `admin` or `therapist`. Deleting a therapist's profile also unlinks them (`on delete set null`).
- **Failure scenario:** A compromised admin session creates extra admin accounts, or locks a therapist out. Proven by `R2 HOLE`. It does **not** lead to intake access on its own: relinking is blocked, which was tested.
- **Suggested fix:** Replace `admin_all` on `profiles` with admin SELECT (and UPDATE of `locale` only). Make `profiles_guard` cover INSERT and DELETE for non-privileged callers.

### F4 · MEDIUM · Retention job silently not scheduled when pg_cron is missing
- **Where:** `…0009_jobs.sql:15`.
- **What's wrong:** Without pg_cron the migration only raises a NOTICE, and intakes are then never purged. That is a legal requirement (11.2).
- **Failure scenario:** The Supabase project is created and the migrations run before pg_cron is enabled. Nobody reads the notice, and intakes stay forever.
- **Suggested fix:** On Supabase, `create extension if not exists pg_cron;` in the migration. Or fail (`raise exception`) unless a test-only setting is present. Also add a health check (admin dashboard or `MAINTENANCE.md`) that `cron.job` contains `thnhc-purge-intakes` and that it ran in the last 48 h.

### F5 · MEDIUM · Intakes of bookings that never happened are kept for the full retention period
- **Where:** `…0005_intake.sql:72` (`delete_after` is only set at insert, from now() + retention).
- **What's wrong:** Holds that expire or bookings that are cancelled before the session keep their health data for 12 months by default. That is data minimisation (AVG art. 5(1)(c)).
- **Failure scenario:** A client abandons the iDEAL checkout. Their complaint stays in the database for a year. Shown by `R4`.
- **Suggested fix:** When an appointment goes to `cancelled` with `cancel_reason = 'hold_expired'`, set the intake's `delete_after = now()` (in `expire_stale_holds()` or an appointments trigger). Ask the owner whether other cancellations should be purged early too.

### F6 · MEDIUM · New tables and functions are granted to anon by default
- **Where:** `…0008_rls.sql:281` (one-off `revoke all on all tables … from anon`). Supabase's default privileges stay in place.
- **What's wrong:** Every table or function added in a later migration is again `GRANT ALL` to anon and authenticated, and functions are `EXECUTE` to PUBLIC. A forgotten `enable row level security` or `revoke execute` then exposes it.
- **Failure scenario:** Phase 4 adds, for example, a `booking_drafts` table with client details and forgets RLS. Anon can read it through PostgREST. Proven by `R6 HOLE`.
- **Suggested fix:** `alter default privileges for role postgres in schema public revoke all on tables from anon;` and `… revoke execute on functions from public, anon;`. Add a schema test in `00_schema.sql` that every public table has RLS enabled and at least one policy, and that anon has no privileges beyond the allow-list.

### F7 · LOW · Deletion reason in the audit log can be set by the caller
- **Where:** `…0005_intake.sql:99`.
- **What's wrong:** `thnhc.deletion_reason` is an ordinary session setting. A manual delete can be logged as `retention_expired`. Shown by `R5`. Not reachable through PostgREST today.
- **Suggested fix:** Use `reason = 'retention_expired'` only when `is_privileged_context()`. Otherwise always log `manual`.

### F8 · LOW · Intake reads are not logged automatically
- **Where:** `…0008_rls.sql:214, 221` (direct SELECT on intakes) and `…0005_intake.sql` `log_intake_access()`.
- **What's wrong:** Logging depends on the app calling `log_intake_access()`. A direct SELECT is not logged.
- **Suggested fix:** Let the app read intakes only through a SECURITY DEFINER function `read_intake(id)` that checks access, writes the log and returns the row. Remove direct SELECT for authenticated.

### F9 · LOW · Therapist can set own `onboarding_status`
- **Where:** `…0002_people.sql:209` (guard list does not include `onboarding_status`). Shown by `R7`.
- **Risk:** If a later phase derives `bookable` from this field, a therapist skips the checklist.
- **Suggested fix:** Add `onboarding_status` to the admin/server-only columns, or compute it on the server.

### F10 · LOW · `authenticated` keeps TRUNCATE (and REFERENCES/TRIGGER) on all tables
- **Where:** Supabase default grants. They are not revoked in `…0008_rls.sql`.
- **Risk:** TRUNCATE bypasses RLS and row triggers (invoice immutability, deletion log). Not reachable through PostgREST, so this is defence in depth only.
- **Suggested fix:** `revoke truncate, references, trigger on all tables in schema public from anon, authenticated;`

## Notes for later phases (not blocking now)
- **Intake delivery address (notifications phase):** the admin can edit `therapists.public_email` and `intake_delivery`. If intake e-mails go to `public_email`, the admin can redirect intake content to themselves. Send intake mail only to the therapist's **auth login e-mail** and log every change of delivery mode.
- **Appointments as health data:** the admin sees every appointment with client name and therapy (for example "Psychology"). The spec allows "see all calendars", but the owner/DPO should confirm this in the privacy statement, or the admin calendar should show initials only.
- **Storage buckets** (photos, invoice PDFs) need their own policies when they are added.
- **Security headers** (CSP, HSTS, frame-ancestors) are not set in `next.config.ts` yet. `/design` pages are public (noindex, fake data). Remove or protect them before go-live.
- **Rate limiting** is not in scope yet. Plan it for the booking, magic-link and webhook routes (Phase 4/5).

## Checked and OK
- RLS enabled on all 36 tables. The admin has no policy on `intakes` or `intake_access_log`. Anon gets only the catalogue and the public therapist columns.
- All public functions pin `search_path`. Server-only SECURITY DEFINER functions (`purge_expired_intakes`, `issue_invoice`, `next_invoice_number`, `expire_stale_holds`, `handle_new_auth_user`) are revoked from PUBLIC/anon/authenticated. The remaining definer helpers only return the caller's own data or booleans.
- Role at sign-up comes from `app_metadata` (not user-editable). Admin or therapist cannot relink `therapists.profile_id` or `clients.profile_id`. Intake therapist/client cannot be moved.
- Invoices: issued invoices and their lines cannot be edited or deleted by the admin (tested). Issuing goes only through `issue_invoice()`.
- Retention purge deletes only intakes and leaves invoices and payments untouched (FKs `restrict`, existing tests).
- Calendar tokens are not selectable through the API. Feed links store hashes only.
- Secrets: `.env` is git-ignored (and was not opened). `.env.example` has names only. Pattern scan of the full `git log -p` (API key, JWT, Mollie, Brevo, AWS, GitHub, PEM and connection-string formats) found nothing. No env or secret is used in `src/`. `tsconfig.tsbuildinfo` is ignored and untracked.

## To unblock
Fix F1 (and invert the `R1 HOLE` assertion). Decide and implement F2 (or log the decision with a DB-level check). F3–F6 should land in Phase 2 as well, because they are small migration changes. Re-run `pnpm test:db` and ask me for a re-review.
