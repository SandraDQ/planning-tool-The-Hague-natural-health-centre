# PLAN.md — THNHC Platform

*Phase 1 deliverable · 25 Oct 2026 · status: **waiting for owner approval***

Source of truth: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) (section numbers below refer to it). Decisions: [`DECISIONS.md`](DECISIONS.md).

---

## 1. In one paragraph

One web app replaces the Wix site. It has three faces: a public site with self-booking (clients), a mobile-first dashboard (therapists), and an admin console (owner). At its heart is a scheduling engine built in two layers, like a building with leases and appointments: first a therapist "leases" a room block, then clients can only book inside that lease. The database itself refuses overlaps, so double bookings are impossible even if two people click at the same moment. Money never touches the centre's account: deposits go straight to each therapist's own payment account, and the centre only bills room rent through its accounting package.

---

## 2. Architecture

```
            Clients (phone/desktop)        Therapists (phone)        Admin
                     │                            │                    │
                     ▼                            ▼                    ▼
        ┌──────────────────────── Next.js app (TypeScript, NL/EN) ──────────────────────┐
        │ public site · booking flow · client area · therapist dashboard · admin console│
        │ server actions / API routes · webhook handlers · ICS feed endpoint            │
        └───────┬───────────────┬────────────────┬───────────────┬──────────────┬───────┘
                │               │                │               │              │
                ▼               ▼                ▼               ▼              ▼
         Supabase (EU)     Mollie Connect    Transactional    Moneybird API   Google / Microsoft
         Postgres + RLS    (therapists'      email (EU)       (centre books,  calendar APIs
         Auth (magic link, own accounts)                      bank feed, BTW) (two-way sync)
         TOTP 2FA)
         Storage (photos, invoice PDFs)
         pg_cron (hold expiry, retention, reminders, rent run, sync)
```

**Key choices**

| Area | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One codebase for site, booking and dashboards; easy for owner + Claude Code to maintain. |
| i18n | `next-intl`, routes `/nl/…` and `/en/…` | Language switch on every page; clean URLs for SEO and Wix redirects. |
| Database | **Supabase Postgres, EU (Frankfurt)** | Row-level security, exclusion constraints, built-in auth, storage and cron in one EU service. |
| Auth | Supabase Auth: magic links (clients), magic link + **TOTP 2FA** (therapists, admin) | No passwords to forget; 2FA required by 11.1. |
| Scheduling | Pure TypeScript module + Postgres constraints | The module computes slots; the database is the final referee (see 4). |
| Payments | **Mollie Connect for Platforms** (see 5.1) | Therapist is the merchant in their own name and pays their own fees; iDEAL native. |
| Accounting | **Moneybird API** + its built-in bank feed | Dutch, flat price, handles centre's BTW and bank reconciliation. |
| Email | EU provider (Brevo or Mailjet, both France) | EU data residency, cheap, good deliverability with SPF/DKIM/DMARC. |
| PDFs | Server-side render (React-PDF) stored in Supabase Storage | Invoices immutable once issued. |
| Hosting | **Vercel Pro, functions pinned to Frankfurt** (alternative: Scaleway, fully EU company) | See open question Q1. |
| Tests | Vitest (unit, scheduling), pgTAP or SQL tests (RLS, constraints), Playwright (E2E, mobile viewport) | Section 15 scenarios become automated tests. |

---

## 3. Data model (first draft)

All times stored as `timestamptz` (UTC); displayed in `Europe/Amsterdam`. Money as integer cents. Every table has `id uuid`, `created_at`, `updated_at`.

**People & access**
- `profiles` (user_id → auth.users, role: `admin` | `therapist` | `client`, locale)
- `therapists` (profile_id, slug, display name, bio_nl/en, photo, public_email, `bookable` flag, onboarding_status, paper_calendar bool, buffer_minutes, reminder_hours, intake_retention_days, intake_delivery mode)
- `therapist_business` (therapist_id, legal_name, trade_name, address, kvk, btw_number, kor bool, registration_numbers) — **admin write, therapist read**
- `clients` (profile_id nullable for guests, first/last name, email, phone, dob, address, locale)

**Catalogue**
- `therapies` (name_nl/en, active)
- `services` (therapist_id, therapy_id, name_nl/en, description, deposit_type `fixed`|`percent`, deposit_value, btw_treatment `21`|`9`|`exempt` + exemption_ground — set by admin, archived_at)
- `session_types` (service_id, name_nl/en, duration_min, price_cents)
- `cancellation_policies` (therapist_id, notice_value, notice_unit `hours`|`business_days`, fee_type, fee_value, exempt_new_clients bool, text_nl/en)
- `intake_questions` (service_id, label_nl/en, type, required)
- `email_templates` (service_id, kind, body_nl/en)

**Rooms & time (the core)**
- `rooms` (number, name, kind `private`|`shared`, active, private_therapist_id)
- `block_templates` (start_time, end_time, e.g. 08:00–12:00) — admin-configurable
- `block_series` (room_id, therapist_id, weekday, block_template_id, starts_on, ends_on) — weekly recurring reservations
- `room_blocks` (room_id, therapist_id, `period tstzrange`, series_id nullable, status `reserved`|`released`, reserved_by) — **one row per concrete block**, generated from series ahead of time (e.g. 6 months) so exceptions are just edits to single rows
  - `EXCLUDE USING gist (room_id WITH =, period WITH &&) WHERE (status = 'reserved')`
- `availability_rules` (therapist_id, weekday, start_time, end_time) — working hours for private-room therapists
- `time_off` (therapist_id, period)
- `paper_windows` (therapist_id, room_id, period, status `open`|`filled`) — admin-opened windows (3.5)
- `external_busy` (therapist_id, period, source, synced_at) — busy times from Google/Outlook, **no titles**
- `appointments` (therapist_id, room_id, room_block_id nullable, client_id, session_type_id, `period tstzrange` (session + buffer), session_period, status `held`|`confirmed`|`cancelled`|`no_show`|`completed`, hold_expires_at, source `online`|`manual`, **snapshot** of price, duration, deposit, policy and BTW at booking)
  - `EXCLUDE USING gist (therapist_id WITH =, period WITH &&) WHERE (status IN ('held','confirmed'))`
  - `EXCLUDE USING gist (room_id WITH =, period WITH &&) WHERE (status IN ('held','confirmed'))`
  - Trigger: a shared-room appointment's `period` must sit inside a reserved `room_blocks` row of the same therapist and room.
- `booking_rules` (therapist_id, min_notice, max_horizon) — table exists, **no UI** (3.4 parked)

**Intake (special-category data, kept apart)**
- `intakes` (appointment_id, answers jsonb, delete_after) — RLS: only the treating therapist and the client; **admin has no policy**
- `intake_access_log`, `deletion_log` (audit)

**Money**
- `payments` (appointment_id, mollie_payment_id unique, mollie_org_id, amount, status, method)
- `webhook_events` (provider, event_id unique, payload hash, processed_at) — idempotency
- `refunds` (payment_id, amount, mollie_refund_id, reason)
- `balance_payments` (appointment_id, method `cash`|`pin`|`transfer`|`tikkie`, amount, paid_on, recorded_by)
- `invoice_sequences` (seller_id, year, last_number) — locked row per seller, gap-free numbering
- `invoices` (seller_type `therapist`|`centre`, seller_id, number, kind `deposit`|`final`|`credit_note`|`room_rent`, buyer snapshot, seller snapshot, issued_at, locale, pdf_path, total) — **immutable** after issue (trigger blocks updates)
- `invoice_lines` (invoice_id, description, qty, unit_cents, btw_rate, btw_cents, exemption_ground)
- `rent_rates` (room_id nullable, per_block_cents, btw_treatment, valid_from)
- `rent_settings` (billing_day, payment_term_days, auto_send bool)
- `rent_runs` (month, status, moneybird_ids)

**Sync**
- `calendar_connections` (therapist_id, provider, encrypted tokens, status, last_error)
- `calendar_feed_tokens` (owner_id, token_hash, revoked_at)
- `calendar_event_links` (appointment_id / room_block_id, provider, external_event_id)

---

## 4. Scheduling engine design

Think of it as a lease and a guest list: `room_blocks` is the lease, `appointments` is the guest list. The app suggests valid slots; Postgres is the bouncer that refuses anyone who doesn't fit.

1. **Candidate windows** per therapist and day:
   - shared room → their reserved `room_blocks`
   - private room → `availability_rules`
   - paper calendar → open `paper_windows`
2. **Subtract** time off, external busy times, and existing held/confirmed appointments (each including buffer).
3. **Generate slots** on a 15-minute start grid; a slot is valid only if `duration + buffer` fits fully before the window end.
4. **Booking** runs in one transaction: delete expired holds for that therapist → insert a `held` appointment with `hold_expires_at = now() + 15 min`. If an exclusion constraint fires, the slot is gone and the client sees "Someone just took this time — here are the nearest ones."
5. **Hold expiry**: `pg_cron` every minute cancels unpaid holds. Webhook confirms the hold into `confirmed`.
6. **DST**: slots are generated in local time, then converted to UTC; tests cover the last Sunday of March and October.
7. **Live preview** for therapists: the same module, run in the browser, shows "3 sessions fit in this block".

---

## 5. Provider choices

### 5.1 Payments — Mollie Connect for Platforms (recommended)

Mollie offers two Connect models:

| | **Connect for Platforms** (recommended) | Connect for Marketplaces |
|---|---|---|
| Who is the merchant | The therapist, in their own name | The centre collects, then routes money to therapists |
| Who pays Mollie fees | The therapist, from their own Mollie balance | The centre is billed and must re-invoice therapists |
| Refunds & chargebacks | Therapist's own account | Centre's platform balance carries the risk |
| Onboarding | OAuth + Mollie Client Links, Mollie's own KYB | Same |
| Fits master prompt 9.1 / decision 3 | **Yes** | No: centre would handle money and fees |

- Platform takes **no application fee** (decision 4). To verify with Mollie sales before Phase 5: that a zero-fee platform is accepted.
- iDEAL is Mollie's core method. The **iDEAL → Wero** migration runs from October 2026 to end of 2027 and is handled by Mollie on its hosted checkout; we only call the API with `method: ideal` and keep an eye on Mollie's changelog.
- Fallback if Mollie declines: Stripe Connect (Standard accounts, iDEAL supported) or MultiSafepay. Compared in an ADR in Phase 5.

### 5.2 Accounting & bank — Moneybird (default, decision 12)
- API for room-rent invoices to therapists (as Moneybird contacts), costs and BTW return.
- Bank feed via Moneybird's built-in PSD2 connection, so the app never holds bank credentials. Dashboard reads balances and matched transactions from Moneybird.
- To confirm with the accountant in Phase 7.

### 5.3 Calendar sync (7A)
- **One-way ICS feed**: signed, revocable URL per person. No provider cost.
- **Google**: Calendar API, scopes `calendar.freebusy` + `calendar.events` (events only on a dedicated "THNHC" calendar we create). These are *sensitive* scopes, so Google app verification is needed (a few weeks, no fee). Start the request early.
- **Microsoft 365/Outlook**: Microsoft Graph `Calendars.ReadWrite`, app registered in the centre's Entra tenant, publisher verification.
- **Apple iCloud**: CalDAV needs the therapist to create an app-specific password. Feasible but clunky; **proposal: one-way ICS only for Apple at launch**, two-way later if asked.

### 5.4 Email
- Brevo or Mailjet (EU). Sender domain authenticated with SPF, DKIM, DMARC during the domain move.

### 5.5 Domain
- Move from Wix to an EU registrar with good DNS, e.g. **TransIP** (Dutch). Checklist in Phase 9, MX records inventoried first.

---

## 6. Running costs (11.3)

Estimates in EUR per month, excluding Mollie transaction fees (paid by therapists). Prices change; each is re-checked before an account is opened.

| Service | Today (11 therapists) | At 35 therapists | Notes |
|---|---|---|---|
| Supabase Pro (EU) | ~€24 | ~€24–35 | $25 incl. small compute; no pausing; daily backups. Data volume is tiny. |
| Hosting (Vercel Pro, 1 seat) | ~€19 | ~€19 | Traffic well within plan. Scaleway alternative ~€10–25. |
| Transactional email (Brevo/Mailjet) | €0–€9 | ~€9–15 | Free tier ~300/day may suffice at first. |
| Moneybird | ~€14–25 | ~€14–25 | Plan + bank-feed add-on; flat, not per therapist. |
| Domain + DNS (TransIP) | ~€1 | ~€1 | ~€10–15 per year. |
| Google / Microsoft APIs | €0 | €0 | Free at this scale. |
| **Total** | **~€60–80** | **~€70–95** | **Within the €80–120 budget.** |

Nothing currently pushes the total over budget. Point-in-time recovery on Supabase (~$100/month) is **not** included and not needed; daily backups suffice. Wix stays paid until the switch-over, then is cancelled.

---

## 7. Phase plan

Each phase ends with its gate from Section 14. I stop and ask you at every gate marked 👤.

| # | Phase | Main agents | Gate |
|---|---|---|---|
| 1 | **Plan** (this document) | architect | 👤 You approve PLAN.md |
| 2 | Foundation: schema, RLS, auth + 2FA, i18n, seed data, **design system** | backend, design-system, privacy-security-reviewer | Migrations + RLS tests pass · 👤 you approve components + 3 mock-ups · accountant answers in |
| 3 | Scheduling engine (test-first) | scheduling-engine, qa | All Section 15 scheduling scenarios pass |
| 4 | Booking flow, client accounts, notifications | booking-frontend, notifications, backend | E2E booking works (no payment) |
| 5 | Payments + invoicing (Mollie test mode) | payments-invoicing, qa | Deposit, refund, balance, invoice, credit-note scenarios pass |
| 6 | Dashboards: client, therapist, admin + calendar sync | dashboard-frontend, backend | Therapist manages everything on a phone |
| 7 | Room rent, financial dashboard, Moneybird + bank (sandbox) | payments-invoicing, finance-dashboard | Test month reconciles with a hand calculation |
| 8 | Website rebuild NL/EN, onboarding wizards, tours, help | site-rebuilder, onboarding-docs, design-system | 👤 You approve the site · setup < 15 min · booking < 2 min |
| 9 | Go-live: live keys, therapist onboarding, domain move | devops-domain, privacy-security-reviewer | Security sign-off · real €1 deposit refunded · DNS/email checklist |

**After you approve this plan**, I'll create the 14 agents in `.claude/agents/` (Section 13) and start Phase 2.

---

## 8. What I still need from you

**Not blocking Phase 2 start, but needed during it:**
- `/wix-export/` folder: **not in the repo yet.** Missing: `brand/` (original logo SVG/PNG, colours), `media/`, `screenshots/`, `sitemap.xml`, `therapists.xlsx`, `dns/`. With the Wix API key in `.env` I can pull media and page content myself; logo, `therapists.xlsx` and DNS still come from you.
- `.env` with at least `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (Supabase project in the centre's name, EU region).
- Accountant answers (Section 16) before Phase 2's gate.

**Open questions** (each has a default I'll use unless you say otherwise; listed in `DECISIONS.md`):
- **Q1 Hosting:** Vercel (simplest, US company, EU region) or Scaleway (fully European, a bit more setup)? *Default: Vercel, Frankfurt.*
- **Q2 Private-room rent:** the master prompt prices rent per block. Do private rooms 3, 4, 6 pay a fixed monthly rent instead? *Default: fixed monthly rate per private room, set in the admin console.*
- **Q3 Paper-calendar windows:** which room are they in? *Default: admin picks the room when opening the window; in a shared room the window must sit inside a block that therapist holds.*
- **Q4 Releasing a block with bookings inside:** *Default: not allowed until those appointments are moved or cancelled; admin can override.*
- **Q5 Apple two-way sync:** *Default: ICS feed only for Apple at launch.*
