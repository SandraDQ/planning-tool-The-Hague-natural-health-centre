# DECISIONS.md

Every decision, with date and who made it. Decisions 1–18 from the master prompt (Section 16) are settled and not repeated here.

| # | Date | Decision | By | Status |
|---|---|---|---|---|
| D1 | 2026-10-25 | Stack: Next.js + TypeScript, Supabase Postgres (EU, Frankfurt) with RLS, Supabase Auth (magic links + TOTP 2FA), `next-intl`, Vitest + Playwright. | Architect | Proposed, awaiting approval |
| D2 | 2026-10-25 | Durations in 5-minute steps; slot start times on a 15-minute grid. | Architect | Proposed |
| D3 | 2026-10-25 | Recurring blocks stored as a series that generates one row per concrete block (~6 months ahead). Exceptions edit single rows. | Architect | Proposed |
| D4 | 2026-10-25 | Overlaps prevented by Postgres `EXCLUDE USING gist` on rooms (blocks, appointments) and therapists (appointments). Appointment period includes the therapist's buffer. | Architect | Proposed |
| D5 | 2026-10-25 | Checkout hold = 15 minutes; expired holds cleared by `pg_cron` every minute and inside each booking transaction. | Architect | Proposed |
| D6 | 2026-10-25 | Appointments snapshot price, duration, deposit, cancellation policy and BTW at booking, so later changes never alter them. | Architect | Proposed |
| D7 | 2026-10-25 | Payments via **Mollie Connect for Platforms** (therapist is merchant in own name, pays own fees, own refunds/chargebacks), zero application fee. Not "Connect for Marketplaces", where the centre would be billed for fees and carry chargeback risk, which conflicts with 9.1 and decision 3. To verify with Mollie that a zero-fee platform is accepted. | Architect | Proposed |
| D8 | 2026-10-25 | iDEAL → Wero migration (Oct 2026 – end 2027) handled by Mollie's hosted checkout; no custom work planned. | Architect | Proposed |
| D9 | 2026-10-25 | Google two-way sync writes to a dedicated "THNHC" calendar and reads free/busy only. Start Google app verification early (sensitive scopes). | Architect | Proposed |
| D10 | 2026-10-25 | Invoice numbering via a locked per-seller sequence row; invoices immutable after issue (DB trigger). | Architect | Proposed |
| D11 | 2026-10-25 | Agents in `.claude/agents/` are created after PLAN.md is approved, not before. | Orchestrator | Proposed |
| D12 | 2026-10-25 | Rooms and renters (therapists) are managed from the admin portal. Room rent is priced **per room** in one of two modes, set by the admin in `rent_rates.pricing_mode`: `fixed_monthly` (fixed amount per month, billed to the room's assigned therapist) or `per_block` (amount per reserved block). A rate with no room is the default per-block rate for shared rooms. Rates have validity dates and cannot overlap per room, so a room can switch mode from a given date. Resolves Q2. | Owner | Decided |
| D13 | 2026-10-25 | Invoice numbers are `YYYY-NNNN`, gap-free per seller per calendar year (Europe/Amsterdam); credit notes share the seller's sequence. Invoices can only be issued through `issue_invoice()` (server only). | Backend | Proposed |
| D14 | 2026-10-25 | Q4 enforced in the database: a block (or private room) with held/confirmed appointments cannot be released, shortened, deleted or reassigned, by anyone. The admin "override" means moving or cancelling those appointments first, in the admin console. | Backend | Proposed |
| D15 | 2026-10-25 | Identity links (`profiles.role`, `therapists.profile_id`, `clients.profile_id`) can only be changed by the server (service role), not by admin through the API, so nobody can link themselves to a therapist or client record and read intake data. The admin invite flow runs server-side. | Backend | Proposed |
| D16 | 2026-10-25 | `intake_delivery` (secure link vs. full content by e-mail) is admin-only per therapist, because 11.2 says the owner may switch it. Retention period stays a therapist setting. | Backend | Proposed |
| D17 | 2026-10-25 | 2FA is enforced in the database (MASTER_PROMPT 11.1): a RESTRICTIVE `require_mfa` policy on every table means admin and therapist sessions see and change nothing unless the JWT has `aal = 'aal2'` (TOTP passed). Clients stay at `aal1` (magic link). Only the own `profiles` row stays readable at aal1, so the app can prompt for TOTP. The app enforces the same rule as a second layer. | Orchestrator | Decided |
| D18 | 2026-10-25 | When a hold expires or a booking is cancelled before its session starts, its intake gets `delete_after = now()` and is removed by the next daily purge (data minimisation, AVG art. 5(1)(c)). Intakes of sessions that took place (completed, no-show, or cancelled after the start) keep the therapist's retention period. | Backend | Proposed |
| D19 | 2026-10-25 | **Overrides master prompt 8 and 8A.** The current website is kept as it is: same logo, look, content, page structure and URLs, rebuilt faithfully from the Wix export. The only additions are a login to the platform (therapists, admin, clients) and online booking. The design system is re-themed to match the existing site (its colours, fonts and logo) instead of the Apple-inspired style; the usability rules from 8A (mobile-first, tap targets, plain language, accessibility) still apply to the new screens. | Owner | Decided |

| D20 | 2026-10-25 | Fonts: keep the open-licence look-alikes (Lato, Jost for Futura, Antonio for the heading font), self-hosted. Owner's choice; the Wix font files are reference only. | Owner | Decided |
| D21 | 2026-10-25 | **MVP first.** Goal: a viewable MVP (site copy + login + booking + admin rooms/renters + therapist calendar) before real services are connected. Until Supabase, Mollie, Moneybird and email are connected, the app runs in **demo mode**: a server-side data layer behind a `DataStore` interface (`src/lib/domain/`), with an in-memory demo implementation seeded with fake data, and a Supabase implementation added later against the existing migrations. Demo state may reset on redeploy. | Owner | Decided |
| D22 | 2026-10-25 | Demo login: a "demo" sign-in page lets a viewer choose to enter as admin, a test therapist or a test client (signed cookie). Real magic links + TOTP replace it when Supabase is connected. Demo mode is clearly labelled on every page and cannot be enabled in production with real keys present. | Orchestrator | Decided |
| D23 | 2026-10-25 | Demo payment: the deposit step shows a clearly labelled "demo payment" screen that simulates the Mollie webhook (succeed / fail / abandon). Real Mollie Connect replaces it in Phase 5. | Orchestrator | Decided |
| D24 | 2026-10-25 | Shared-room slots = reserved blocks intersected with the therapist's working hours when they have set any; with no working hours set, the whole block is bookable (master prompt 3.2). | Orchestrator (default) | Decided |
| D25 | 2026-10-25 | A therapist's manual booking during their own time off is allowed with a warning, not refused ("therapists decide"). Online slots never fall in time off. | Orchestrator (default) | Decided |

## Open questions (defaults apply unless the owner says otherwise)

| # | Question | Default |
|---|---|---|
| Q1 | Hosting: Vercel (EU region) or Scaleway (EU company)? | Vercel Pro, Frankfurt functions |
| Q2 | Private rooms 3, 4, 6: fixed monthly rent or per block? | Fixed monthly rate per private room, set in admin console |
| Q3 | Which room does a paper-calendar window use? | Admin picks the room; in a shared room it must sit inside a block that therapist holds |
| Q4 | Can a therapist release a block that has bookings? | No, until bookings are moved or cancelled; admin can override |
| Q5 | Apple iCloud two-way sync at launch? | No, ICS feed only for Apple at launch |

## Waiting on the accountant (before Phase 2 gate)
- Structure of deposit invoice vs. final invoice, and BTW timing (at deposit or at session).
- BTW on room rent (exempt or 21%, option for taxed letting).
- BTW status per therapist (21%, 9%, exempt + legal ground, KOR).
