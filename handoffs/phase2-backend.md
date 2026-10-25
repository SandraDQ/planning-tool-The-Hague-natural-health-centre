# Phase 2 · backend handoff: database foundation

*2026-10-25 · backend agent · updated after the privacy-security review (see "Review fixes") · nothing committed (the orchestrator commits)*

## What I built

**Migrations** (`supabase/migrations/`, apply in filename order):

| File | Contents |
|---|---|
| `…0001_foundation.sql` | `btree_gist`, `pgcrypto` (schema `extensions`), `set_updated_at()`, `is_privileged_context()`, list of THNHC error codes |
| `…0002_people.sql` | `profiles`, `therapists` (= renters), `therapist_business`, `clients`; helpers `auth_role()`, `current_therapist_id()`, `current_profile_id()`, `current_client_ids()`, `is_admin()`; trigger on `auth.users` that creates a profile (role from `app_metadata`, default `client`); guards on identity links and admin-only columns |
| `…0003_catalogue.sql` | `therapies`, `services` (deposit fixed ≥ 100 cents or 1–100 %, admin-only BTW treatment), `session_types` (5-min steps), `cancellation_policies`, `intake_questions`, `email_templates` |
| `…0004_rooms_and_time.sql` | `rooms` (admin-configurable: private/shared, active, assigned therapist), `block_templates`, `block_series`, `room_blocks`, `availability_rules`, `time_off`, `paper_windows`, `appointments`, `booking_rules`; exclusion constraints; the room-layer triggers; `materialize_block_series()`, `expire_stale_holds()` |
| `…0005_intake.sql` | `intakes` (with `delete_after`), `intake_access_log`, `deletion_log`; `purge_expired_intakes()`, `log_intake_access()` |
| `…0006_money.sql` | `rent_settings`, `rent_rates` (`fixed_monthly` or `per_block` per room, D12), `rent_runs`, `invoice_sequences`, `invoices`, `invoice_lines`, `payments`, `refunds`, `balance_payments`, `webhook_events`; `next_invoice_number()`, `issue_invoice()`; triggers that make invoices immutable |
| `…0007_sync.sql` | `calendar_connections`, `calendar_feed_tokens` (hash only), `calendar_event_links`, `external_busy` (no titles); `hash_feed_token()` |
| `…0008_rls.sql` | RLS on all 36 tables, explicit policies per role (2FA, profiles and intake reads tightened in 0010), column grants, function `EXECUTE` revokes, `updated_at` triggers |
| `…0009_jobs.sql` | pg_cron jobs (hold expiry every minute, intake purge daily). Soft check, superseded by 0010 |
| `…0010_review_fixes.sql` | Fixes F1–F10 from the privacy-security review (see "Review fixes") |

**How the database guarantees the core rules**
- `room_blocks_no_overlap`: one reserved block per room at any moment.
- `appointments_no_therapist_overlap` / `appointments_no_room_overlap`: no overlapping held/confirmed appointments. `period` = session plus the buffer, computed by the trigger from `session_period` and the buffer snapshot.
- Trigger `appointments_check_room`: in a shared room, `period` (with buffer) must sit inside a reserved block of the same therapist and room, and the trigger sets `room_block_id`. In a private room, the room must be assigned to that therapist. The block row is locked `FOR SHARE`, so a release that runs at the same moment cannot strand the booking.
- Blocks and rooms cannot be released, shortened, deleted, made private, reassigned or deactivated while they still have future held/confirmed bookings (D14).
- Snapshot (D6): the trigger fills names, duration, price, buffer, deposit, BTW and the cancellation policy at insert. Later edits never change them (tested).
- Invoices: created as drafts and issued only via `issue_invoice()`. That function freezes totals from the lines, snapshots seller and buyer, and takes a gap-free number `YYYY-NNNN` from the locked `invoice_sequences` row. After issue only `pdf_path` and `sent_at` can be filled in, once each. Issued lines cannot change.
- Intakes: admin has **no policy** on `intakes` or `intake_access_log`. Identity links (`profiles.role`, `therapists.profile_id`, `clients.profile_id`) can only be changed by the service role (D15), which closes the "admin links themselves to a therapist" path.

**Seed** (`supabase/seed.sql`, can be run more than once): 6 rooms (3, 4, 6 private, 1, 2, 5 shared; room 3 is assigned to Test Therapeut C), block templates 08–12, 13–17 and 18–22, the 13 therapies (Dutch names are drafts), 3 fake therapists `Test Therapeut A/B/C` (`*.invalid` e-mail addresses, C not bookable), test services, session types and policies, and the `rent_settings` row. No rent rates, because the admin enters those.

**Decisions** appended to `DECISIONS.md`: D12 (owner: rent mode per room, resolves Q2), D13–D16 (proposed by me).

## How to test

```
pnpm test:db      # scripts/test-db.sh
```
The script starts a throwaway Postgres 16 cluster in `/tmp/thnhc-testdb.*`. It listens on a unix socket only (no TCP port) and runs as the `postgres` OS user when started as root. It then applies `supabase/test-support/auth_stub.sql` (local-only stand-in for Supabase's `auth` schema and its roles), the migrations, the seed (twice, to prove it can be re-run) and `test_helpers.sql`. Every `tests/db/*.sql` runs in its own transaction and is rolled back. Last, two real parallel sessions race for the same block and for the same slot. Any failed assertion or SQL error makes the script exit with code 1 (checked with a deliberately failing test). Use `KEEP_TEST_DB=1` to keep the cluster for debugging.

Test files: `00_schema` (RLS and the 2FA policy on every table, anon allow-lists, no TRUNCATE, clean default privileges, no admin or anon policy on intake tables, all `*_cents` columns are integers, seed), `10_room_blocks`, `20_appointments`, `30_invoices`, `40_rls` (each role: therapist A/B, admin, client, anon), `50_retention`, `60_rent_and_money`, `90_review` (the reviewer's proof tests, now asserting each fix).

Last run (after the review fixes):
```
PASS tests/db/00_schema.sql (20 assertions)
PASS tests/db/10_room_blocks.sql (28 assertions)
PASS tests/db/20_appointments.sql (49 assertions)
PASS tests/db/30_invoices.sql (31 assertions)
PASS tests/db/40_rls.sql (87 assertions)
PASS tests/db/50_retention.sql (19 assertions)
PASS tests/db/60_rent_and_money.sql (26 assertions)
PASS tests/db/90_review.sql (61 assertions)
PASS concurrency: two therapists reserve the same block (exactly one of two simultaneous sessions succeeded)
PASS concurrency: two clients book the same slot (exactly one of two simultaneous sessions succeeded)
test-db: 10 passed, 0 failed, 323 assertions
```
`pnpm typecheck` passes.

## Review fixes (privacy-security review, BLOCK → fixed)

All fixes are in one new migration, `supabase/migrations/20261025000010_review_fixes.sql`, so the review diff is in one place. The earlier migrations are unchanged. Every `HOLE:` assertion in `tests/db/90_review.sql` is now inverted (`Rn FIXED`).

| # | Fix |
|---|---|
| F1 | Only the server (service role) can set a non-null `clients.profile_id`, and only to a profile with role `client`. Client self-insert through the API was removed (`client_insert_own` dropped). `appointments.client_id` and `therapist_id` cannot be changed by API users once set (`trg_appointments_0_guard`, TH005); admin can still reschedule. As a belt, `current_client_ids()` counts only accounts with role `client`. |
| F2 | D17: a RESTRICTIVE `require_mfa` policy on **every** table. Admin and therapist need `auth.jwt() ->> 'aal' = 'aal2'`; clients work at aal1. The own `profiles` row stays readable at aal1. `read_intake`, `log_intake_access` and `job_health` check this too. The local auth stub's `auth.jwt()` now carries `aal`; `tests.login(name, aal default 'aal2')`. |
| F3 | Admin is read-only on `profiles` (`admin_all` replaced by `admin_select`). `profiles_guard` now covers INSERT, UPDATE and DELETE for API users. |
| F4 | The migration creates pg_cron if it is available, otherwise **fails** with a clear message. Only `thnhc.allow_missing_pg_cron=on` skips this (set by `scripts/test-db.sh`, local only). Verified: without that setting, migration 0010 stops with an error. New `job_health()` (admin with 2FA, or server) returns, per job: scheduled, schedule, last run, last status, healthy (succeeded within 5 min for holds, 48 h for the purge). |
| F5 | D18: when an appointment becomes `cancelled` before its session starts (incl. expired holds via `expire_stale_holds()`), its intake gets `delete_after = now()`. An intake stored for an already-cancelled booking is also due at once. |
| F6 | `alter default privileges`: future tables/sequences/functions in `public` are not granted to anon/authenticated, and functions are not executable by PUBLIC. Existing functions: anon can execute only `is_bookable_therapist` and `is_public_service`. `00_schema` asserts the anon allow-lists (tables, columns, functions), the 2FA policy on every table and clean default ACLs. |
| F7 | `purge_expired_intakes()` writes its own `retention_expired` log rows in the same statement as the delete. Every other deletion is logged `manual` by the trigger. No session setting is involved. |
| F8 | `intakes.answers` cannot be selected directly by `authenticated` (column grants cover metadata only). The treating therapist and the client read content only through `read_intake(id)`, which checks access + 2FA and writes `intake_access_log`. |
| F9 | `onboarding_status` is admin/server-only. |
| F10 | TRUNCATE, REFERENCES and TRIGGER revoked from anon and authenticated on all tables. |

**Consequences for app code (later phases)**
- Read intake content with `rpc('read_intake', { p_intake_id })`, never `select answers`. Listing intakes (`id, appointment_id, delete_after, …`) still works, but `select *` on `intakes` is refused.
- Linking a guest client record to a new account, and storing intakes, is server work (service role).
- Admin/therapist UI must complete Supabase MFA (TOTP → aal2) before loading data. At aal1 every query returns nothing (or `42501` on writes). Use `auth_role()` and the own profile row to decide whether to show the TOTP prompt.
- **Every new migration** must `grant` explicitly what anon/authenticated need, `enable row level security`, add policies **and** a `require_mfa` restrictive policy, and add `trg_set_updated_at`. `00_schema` fails otherwise.
- Supabase: enable pg_cron (Database → Extensions) before applying migration 0010. Use `select * from job_health()` in the admin dashboard and `MAINTENANCE.md`.
- From the reviewer's later-phase notes (not done here): send intake e-mails to the therapist's **login e-mail**, not `public_email` (which the admin can edit), and log changes of `intake_delivery`. Add storage bucket policies, security headers and rate limiting in their phases.

**Still open after the review**
- D18 covers cancellations before the session. Should cancellations by the therapist *after* a session started, or no-shows, also purge early? (Default: no, keep the retention period.)
- Owner/DPO: the admin calendar shows client names with therapy type (e.g. "Psychology"). Is that acceptable, or should the admin see initials only?

## Notes for other agents

- **Error codes** (SQLSTATE) to map to friendly messages: `23P01` = slot or block just taken ("Someone just took this time"); `TH001` = outside the therapist's block; `TH002` = private room not theirs; `TH003` = invoice immutable; `TH004` = would strand bookings; `TH005` = admin/server-only field; `TH006` = wrong or inactive room, or block not on a template; `TH007` = paper window unavailable; `TH008` = session type belongs to another therapist; `TH009` = block already started; `TH010` = money rule. The list is also at the top of `0001_foundation.sql`.
- **Booking transaction** (scheduling-engine / booking-frontend): `select expire_stale_holds(:therapist)`, then insert into `appointments` with `therapist_id, room_id, client_id, session_type_id, session_period, status='held', hold_expires_at=now()+15 min`. Leave the snapshot columns and `period` empty, because the triggers fill them.
- **Blocks**: therapists insert blocks themselves (they must match a template, be in the future and be in their own name). `materialize_block_series(series_id, until)` generates weekly blocks, is DST-safe, can be run again safely, and skips dates another therapist already holds.
- **Invoices** (payments-invoicing): insert a draft and its lines (with BTW fields per line), then call `issue_invoice(id)` with the service role. Credit notes need `credited_invoice_id` and negative lines.
- **Anon queries on `therapists` must name columns** (`id, slug, display_name, bio_nl, bio_en, photo_path, public_email`): `select *` is refused by the column grants.
- `calendar_connections` token columns cannot be selected through the API. The server writes them with the service role. Feed links store only `hash_feed_token(token)`.
- New tables in later migrations need their own `enable row level security`, policies and `trg_set_updated_at` trigger, because the loop in 0008 ran only once.
- Requires **Postgres 15+** (`unique nulls not distinct`). Enable **pg_cron** in Supabase before applying the migrations; 0010 fails without it.
- `supabase/test-support/` is for local tests only. **Never apply it to Supabase.**

## Open questions (for the orchestrator / owner)

1. **Anon access to cancellation policies and intake questions.** The task limited anon to therapists, services, session types and therapies. The booking flow must show the policy and the extra intake questions before payment. Right now the server has to read them with the service role. Should anon get read access for bookable therapists' active services?
2. **Fixed monthly rent on shared rooms.** The DB allows `fixed_monthly` on any specific room and bills it to the room's assigned therapist. Shared rooms have no assigned therapist. Should `fixed_monthly` be limited to private rooms? Also: `rooms.private_therapist_id` holds only the current renter, so if a private room changes renter mid-month, a `room_assignments` history table is needed for correct rent. Add one now or in Phase 7?
3. **Room-rent invoice numbers.** If Moneybird issues the legal rent invoices (PLAN 5.2), our `invoices` rows for the centre should mirror Moneybird's invoices (via `external_ref`) and not use our own centre sequence. To decide in Phase 7.
4. **Retention changes.** A new retention period applies only to new intakes, and existing intakes keep their `delete_after`. Should a change also apply to existing intakes?
5. **Room grid visibility.** Therapists can see all reserved blocks (which therapist holds which room and when) so they can pick free blocks. Is that acceptable, or should they only see free/taken?
6. **One role per account.** If the owner is also a treating therapist, she needs two logins (admin + therapist). OK?
7. **Percentage deposits** below €1 are raised to €1 for online bookings (decision 2). Manual bookings default to a €0 deposit.
8. **Backups**: deleted intakes stay in Supabase's daily backups until those backups expire (about 7 days on Pro). The privacy statement should mention this.
9. A logged-in client (role `authenticated`) can read every column of a bookable therapist's row, for example buffer, retention days and `profile_id`. Anon cannot. None of these fields are personal data. If we want this strict, we need a public view.
