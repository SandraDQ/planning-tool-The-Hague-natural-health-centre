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
