# Phase 2 · backend handoff: database foundation

*2026-10-25 · backend agent · nothing committed (the orchestrator commits)*

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
| `…0008_rls.sql` | RLS on all 36 tables, explicit policies per role, column grants, function `EXECUTE` revokes, `updated_at` triggers |
| `…0009_jobs.sql` | pg_cron jobs (hold expiry every minute, intake purge daily). Does nothing if pg_cron is missing |

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

Test files: `00_schema` (RLS on every table, no admin or anon policy on intake tables, all `*_cents` columns are integers, seed), `10_room_blocks`, `20_appointments`, `30_invoices`, `40_rls` (each role: therapist A/B, admin, client, anon), `50_retention`, `60_rent_and_money`.

Last run:
```
PASS tests/db/00_schema.sql (12 assertions)
PASS tests/db/10_room_blocks.sql (28 assertions)
PASS tests/db/20_appointments.sql (49 assertions)
PASS tests/db/30_invoices.sql (31 assertions)
PASS tests/db/40_rls.sql (87 assertions)
PASS tests/db/50_retention.sql (19 assertions)
PASS tests/db/60_rent_and_money.sql (26 assertions)
PASS concurrency: two therapists reserve the same block (exactly one of two simultaneous sessions succeeded)
PASS concurrency: two clients book the same slot (exactly one of two simultaneous sessions succeeded)
test-db: 9 passed, 0 failed, 254 assertions
```
`pnpm typecheck` passes.

## Notes for other agents

- **Error codes** (SQLSTATE) to map to friendly messages: `23P01` = slot or block just taken ("Someone just took this time"); `TH001` = outside the therapist's block; `TH002` = private room not theirs; `TH003` = invoice immutable; `TH004` = would strand bookings; `TH005` = admin/server-only field; `TH006` = wrong or inactive room, or block not on a template; `TH007` = paper window unavailable; `TH008` = session type belongs to another therapist; `TH009` = block already started; `TH010` = money rule. The list is also at the top of `0001_foundation.sql`.
- **Booking transaction** (scheduling-engine / booking-frontend): `select expire_stale_holds(:therapist)`, then insert into `appointments` with `therapist_id, room_id, client_id, session_type_id, session_period, status='held', hold_expires_at=now()+15 min`. Leave the snapshot columns and `period` empty, because the triggers fill them.
- **Blocks**: therapists insert blocks themselves (they must match a template, be in the future and be in their own name). `materialize_block_series(series_id, until)` generates weekly blocks, is DST-safe, can be run again safely, and skips dates another therapist already holds.
- **Invoices** (payments-invoicing): insert a draft and its lines (with BTW fields per line), then call `issue_invoice(id)` with the service role. Credit notes need `credited_invoice_id` and negative lines.
- **Anon queries on `therapists` must name columns** (`id, slug, display_name, bio_nl, bio_en, photo_path, public_email`): `select *` is refused by the column grants.
- `calendar_connections` token columns cannot be selected through the API. The server writes them with the service role. Feed links store only `hash_feed_token(token)`.
- New tables in later migrations need their own `enable row level security`, policies and `trg_set_updated_at` trigger, because the loop in 0008 ran only once.
- Requires **Postgres 15+** (`unique nulls not distinct`). Enable **pg_cron** in Supabase before applying 0009, or re-run its `DO` block afterwards.
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
