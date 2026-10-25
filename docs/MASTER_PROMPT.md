# Master Prompt — The Hague Natural Health Centre Platform
*v1.0 · 25 Oct 2026 · ready for Phase 1 · all decisions are in Section 16*

**Changes in v1.0:** Section 0.1 (project setup, secrets, account ownership) · Wix API key route confirmed.

**Changes in v0.5:** existing logo is mandatory and unchanged · two-way calendar sync (new 7A) · therapist pays the payment-provider fee · running-cost budget (new 11.3) · Wix export folder as input (new 8C).

**Changes in v0.4:** centre income = room rent only (no commission) · deposit fully therapist's choice · new Section 8A Design (simple, Apple-inspired) · new Section 8B Onboarding & feature walkthroughs · self-booking from therapist-set timeslots made explicit · new agents: design-system, onboarding-docs.

**Changes in v0.3:** therapists fully control durations, prices, buffers and cancellation policy · deposit at booking, balance recorded by therapist · admin enters therapists' tax details · intake data e-mailed to therapist, retention set by therapist · Wix replaced entirely, domain transferred from Wix · NL + EN · marketplace model (therapist = seller) with iDEAL · monthly room-rent invoicing configured in admin console · bookkeeping via accounting API, bank via licensed PSD2 provider.

---

## 0. Your role (Claude Code — lead orchestrator)

You are the **lead engineer and orchestrator** for this project. You do not write most of the code yourself. You:
1. Read this whole document, then produce `PLAN.md` (architecture, data model, provider choices, phase plan) and **stop for human approval**.
2. Create the subagents in Section 13 under `.claude/agents/`, delegate work phase by phase, and review every handoff.
3. Never start a phase until the previous phase's gate (Section 14) passes.
4. When something is ambiguous or contradictory, **ask — don't guess**. Log every decision in `DECISIONS.md`.
5. **Do not build accounting, payment or banking infrastructure from scratch.** Integrate proven, licensed providers (Sections 9–10).

### 0.1 Project setup & secrets
- Save this document as `docs/MASTER_PROMPT.md`; keep `CLAUDE.md` short and point to it.
- **Secrets live only in `.env`** (git-ignored), never in this document, code, logs, commits or chat output. Create `.env.example` with names only:
  `WIX_API_KEY= · WIX_ACCOUNT_ID= · WIX_SITE_ID= · DATABASE_URL= · SUPABASE_URL= · SUPABASE_SERVICE_ROLE_KEY= · MOLLIE_API_KEY= · MONEYBIRD_TOKEN= · EMAIL_API_KEY= · GOOGLE_CLIENT_ID= · GOOGLE_CLIENT_SECRET= · MICROSOFT_CLIENT_ID= · MICROSOFT_CLIENT_SECRET=`
- If `.env` or a required key is missing, stop and ask the owner to add it. Don't ask for it to be pasted into chat.
- **All service accounts are registered in the centre's name** (owner's email), not a developer's: hosting, database, GitHub, payment provider, accounting, email, domain registrar.
- Start in plan mode: Phase 1 only, then stop.

**Goal:** a simple booking and payment process for new and returning clients of The Hague Natural Health Centre (THNHC), a foolproof room-and-calendar system that therapists fully control, and a financial overview for the owner.

---

## 1. Ground truth (facts — do not change without asking)

- Existing website: https://www.thehague-naturalhealthcentre.com (Wix — **to be replaced entirely**). Location: Badhuisstraat 224, Scheveningen, The Hague.
- Languages: **Dutch and English** throughout (site, booking flow, dashboards, emails, invoices). Language switch on every page; emails/invoices in the client's chosen language.
- Timezone `Europe/Amsterdam`, currency EUR. Store UTC, display local (handle DST).
- **Rooms:** 6 today, up to 7 (admin-configurable).
  - **Private rooms (3, 4, 6):** one dedicated therapist each (Homeopathy, Acupuncture, Psychology). Bookable any time within that therapist's availability.
  - **Shared rooms (1, 2, 5):** shared by 3–7 therapists, used only via 4-hour blocks (3.1).
- **Therapists:** 11 today, up to 35.
- **Therapies (admin-editable):** Acupuncture · Chinese Herbs · High Power Laser Therapy · Ayurveda · Coaching · Doula · Homeopathy · Massage · Nutrition · Orthomoleculaire · Psychology · Reiki · Shamanism.
- **Therapists are independent businesses and the seller of their own services** (marketplace model). The centre's **only** income through the app is room rent (invoiced monthly). **No commission** on bookings.
- **Clients book entirely by themselves** on the website, choosing from the timeslots therapists have opened. No phone calls or emails needed; availability is always live.
- Clients pay a **deposit online (iDEAL)** when booking; the balance is settled with the therapist.
- **Guiding principle: therapists decide.** Anything about their own service (duration, price, buffer, deposit, cancellation policy, data retention, templates) is a therapist setting, not a hard-coded rule.

---

## 2. Roles

| Role | Can do |
|---|---|
| **Admin** (owner) | Manage therapists, rooms, therapies; **enter each therapist's business & tax details**; assign private rooms; manage shared-room blocks; configure room-rent invoicing; see all calendars; financial dashboard; BTW overview; bank & accounting connection. Admin does **not** see clients' intake/medical data. |
| **Therapist** | Log in (mobile-friendly, 2FA); full control over their services and settings (Section 4); reserve shared-room blocks; see own appointments, add manual bookings, record balance payments; see own revenue, invoices and payouts. Cannot see other therapists' clients or finances. |
| **Client** | Book as guest or with an account; pay deposit; see appointments and invoices; cancel/reschedule; rebook with prefilled details. |

---

## 3. Scheduling engine (the core — must be foolproof)

Two layers: the *room layer* (who holds the room) and the *appointment layer* (who sees which client). An appointment can only exist inside a valid room layer.

### 3.1 Tier 1 — Room allotment (shared rooms)
- Fixed blocks: **08:00–12:00, 13:00–17:00, 18:00–22:00** (admin-configurable).
- Reserved by therapist or admin, usually **weekly recurring**, with one-off exceptions.
- One block = one therapist. Double-booking must be **impossible at database level** (e.g. Postgres exclusion constraints on time ranges per room).
- Reserved blocks feed monthly room-rent invoicing (9.4).

### 3.2 Tier 2 — Client appointments
- Shared-room therapists: public slots exist **only inside their reserved blocks**, intersected with their availability.
- Private-room therapists: slots = their own working hours.
- Appointment + the therapist's buffer must fit within the block; how they fill the block is up to them.
- No overlapping appointments per room or per therapist (DB-level constraint).
- Slot is **held for 10–15 min** during checkout; unpaid holds expire.

### 3.3 Durations & buffers — therapist-controlled
- **No fixed durations and no centre minimum buffer.** Each service has its own duration (any length, in 5- or 15-min steps — architect decides) and the therapist sets their own buffer (including 0).
- Show the therapist a live preview of how many sessions fit in a block with their current settings.

### 3.4 Booking window
- Minimum notice / maximum horizon: **parked**. Build the data model so it can be added later as a therapist setting; no UI for now.

### 3.5 "Paper calendar" therapists
- Admin opens a small **allotted window** (e.g. "Thursdays 14:00–16:00"); it closes once booked.
- Same online deposit and invoicing as everyone else.
- Therapists can **enter their manual (phone/paper) bookings in the app** so invoicing, deposits and room records stay complete.

---

## 4. Therapist settings (all editable at any time by the therapist)

**Services** — per service: name (NL/EN), therapy category, description, **duration, price, deposit**, session types (e.g. "First session incl. intake", "Follow-up") each with their own duration and price. Add/edit/archive at will; changes never alter already-booked appointments.
**Availability** — working days and hours (private rooms), block reservations (shared rooms), buffer, time off.
**Deposit** — fixed amount or percentage per service, **fully the therapist's choice** (required, minimum €1, no maximum).
**Cancellation policy** — fully therapist-defined: notice period (hours or business days), fee as fixed amount or % of price, exceptions (e.g. "no fee for new clients"). Shown to the client before payment.
**Intake form** — standard fields (5) plus optional extra questions per service.
**Data retention** — how long intake data is kept (e.g. 30 days, 1 year, until manually deleted). Default: 12 months.
**Email templates** — confirmation / "what to expect" text per service, NL + EN.
**Profile** — bio, photo, public contact email (e.g. ira@lahira.nl).

**Entered by admin, not therapist (read-only for therapist):** legal/trade name, KvK, BTW number or KOR status, BTW treatment per service (21% / 9% / exempt + legal ground), professional registration numbers, payout account (via payment-provider onboarding, 9.2).

---

## 5. Client booking flow (Calendly / Treatwell simplicity)

1. **Choose** — by Therapy or by Therapist.
2. **Choose service & session type** — show duration, full price, deposit, and "balance payable at the session".
3. **Choose time** — only valid slots; slot held during checkout.
4. **Guest or account** — magic-link login, no passwords.
5. **Form** (prefilled for returning clients):
   - First & last name, email, phone — required
   - Reason for visit / main complaint — required (placeholder: *digestive complaint, chronic pain, general relaxation…*)
   - New or returning client — required (auto-detected when logged in)
   - Date of birth — optional
   - Address — optional (invoicing)
   - Comments — optional
   - Therapist's extra questions, if any
   - Accept therapist's cancellation policy + consent for processing health data — required
6. **Pay deposit** via iDEAL (hosted checkout).
7. **Confirmed** only after the payment webhook succeeds → on-screen success + emails.

---

## 6. Notifications & cancellation

**To client:** booking details, therapy-specific template, deposit paid, balance due at session, therapist contact email, cancellation policy, cancel/reschedule links, deposit receipt/invoice (9.3).
**To therapist:** booking details + **intake form contents** (see 11.2 on how this is sent securely).
**Reminder** before the session — timing set by therapist (default 24 hours before).

**Cancellation (therapist's own policy applies):**
- On time → deposit refunded automatically.
- Late → fee per policy is kept from the deposit, rest refunded. If the fee exceeds the deposit, the difference is shown to the therapist as outstanding (the app does not chase it).
- No-show → deposit kept; therapist can mark no-show.
- Therapist cancels → full refund, client notified.
- Every refund produces the matching credit note.

---

## 7. Dashboards

**Client:** appointments, invoices, cancel/reschedule, rebook.
**Therapist (mobile-first):** calendar · appointments · **add manual booking** · **record balance payment** (method: cash / PIN / bank transfer / Tikkie, amount, date) → final invoice generated · mark no-show · block time off · reserve/release blocks · all settings from Section 4 · own revenue, outstanding balances, invoices, payouts.
**Admin:** room grid (all rooms × week) · calendars · therapist management incl. tax details · room-rent invoicing settings · financial dashboard (Section 10).

---

## 7A. Calendar sync (available to every therapist and the admin)

The app stays the **single source of truth** for bookings; sync makes it play nicely with the calendars people already live in.

- **One-way feed (everyone, zero setup):** a private subscription link (iCal/ICS) that shows all their appointments and room blocks in Apple Calendar, Google Calendar or Outlook. The therapist can reset the link at any time.
- **Two-way sync (optional, per therapist):** connect Google Calendar or Microsoft 365/Outlook (Apple iCloud via CalDAV if feasible — architect checks). Busy times in their personal calendar **block** those times on the booking site, so a dentist appointment or school pick-up can never be double-booked. New bookings are written into their calendar automatically.
- **Privacy:** events in external calendars show only the client's first name and service (e.g. "Anna — Acupuncture"), never the complaint or intake data. Personal-calendar events are read only as "busy"; their titles are never stored.
- Changes made in the app (cancel, reschedule) update the external calendar within minutes. Sync errors are shown to the therapist, never silently ignored.
- Paper-calendar therapists can use the one-way feed too.

---

## 8. Website & domain

- **Replace Wix entirely.** Carry over the content and structure of the current site (owner's own content, used with permission), but **redesign it in the new style (8A)**. **The existing logo is essential and must be used exactly as it is** — never redrawn, recoloured, cropped or "modernised". Brand colours: keep them unless the owner approves a refresh. Download all images into the repo; translate pages so NL and EN both exist (Claude drafts, owner approves).
- Redirect old Wix URLs to new ones (keep SEO).
- **Domain transfer from Wix** (devops-domain agent prepares a checklist; the owner performs account actions):
  1. Inventory all current DNS records, especially **email (MX)** — check whether email runs via Wix/Google Workspace and keep it working.
  2. Check the domain is not within a 60-day transfer lock; unlock it in Wix and request the auth/EPP code.
  3. Transfer to the chosen registrar/DNS host; recreate all records first.
  4. Set up SPF, DKIM and DMARC for the transactional email sender.
  5. Switch over at a quiet moment, with a rollback plan; cancel Wix only after everything is verified.

---

## 8A. Design — simple, calm, Apple-inspired

The feel: a quiet treatment room, not a busy reception desk. Everything should feel obvious without explanation.
*(Inspired by Apple's design principles — clarity, restraint, focus — not a copy of Apple's branding, icons or UI.)*

- **One thing per screen.** Each step asks one question; one clear primary button per screen.
- **Lots of whitespace**, generous margins, content centred and never cramped.
- **Typography does the work:** one clean sans-serif (e.g. Inter or the system font stack), large headings, a strict type scale (max ~5 sizes), comfortable line height.
- **The logo leads:** the original logo file is the anchor of the design; the palette is built around it, never the other way round. Use the original vector/high-res file from 8C.
- **Restrained palette:** warm neutral background, one accent colour taken from the logo, soft greys for secondary text. No gradients or decorative clutter.
- **Soft depth:** subtle shadows, rounded corners (12–20 px), cards for grouping, frosted/blurred sticky headers sparingly.
- **Gentle motion:** short, purposeful transitions (150–250 ms); respect `prefers-reduced-motion`.
- **Mobile-first**, large tap targets (≥ 44 px), bottom-sheet style pickers on mobile.
- **Plain language** in NL and EN: short sentences, no jargon ("Choose a time", not "Select availability slot").
- **Photography:** calm, natural, real photos of the centre and therapists.
- Light and dark mode.
- **Design system first:** the design-system agent builds tokens (colour, type, spacing, radius, shadow) and a component library (buttons, inputs, calendar/time picker, cards, sheets, toasts, empty states) before any screens are built. All other agents use only these components.
- Quality bar: booking from home page to paid confirmation in **under 2 minutes and at most 5 screens**, tested on a phone.

---

## 8B. Onboarding & feature walkthroughs

Goal: no one needs a manual or a phone call to get started.

### Admin (owner) — setup wizard on first login
1. Centre details & branding → 2. Rooms (private/shared, block times) → 3. Therapies → 4. Invite therapists (email invite) → 5. Enter each therapist's business & tax details → 6. Room-rent rates & invoicing schedule → 7. Connect accounting package & bank → 8. Go-live checklist.
- Progress is saved; the wizard can be paused and resumed.
- Admin overview shows each therapist's onboarding status and what's missing.

### Therapist — setup wizard after accepting the invite
1. Welcome (2-min overview) → 2. Profile (photo, bio NL/EN, contact email) → 3. Services (duration, price, deposit, session types) → 4. Availability (working hours or block reservations, buffer) → 5. Cancellation policy → 6. Data retention & intake questions → 7. Payment-provider onboarding (identity check, payout account) → 8. **Preview your public booking page** → 9. Go live.
- Smart defaults and examples at every step; everything editable later.
- A therapist only becomes **bookable** once the essentials are complete (services, availability, payment onboarding). A checklist shows what's left.

### Feature walkthroughs (in-app)
- Short interactive tours (3–6 steps, skippable, replayable from a "?" menu) for each main feature: calendar, blocks, manual bookings, recording a balance payment, cancellations/refunds, invoices, settings, financial dashboard, room-rent invoicing.
- Helpful **empty states** that explain what goes there and offer the next action ("No services yet — add your first one").
- Contextual tips the first time a feature is used; never repeated once dismissed.

### Clients
- No onboarding needed: the booking flow explains itself. Clear progress indicator, friendly error messages, and a reassuring confirmation screen ("What happens next").

### Help & handover
- In-app help centre (NL/EN): short articles per feature, with screenshots or short screen recordings.
- A **handover guide** for the owner: a complete walkthrough of every feature, plus a 1-page quick-start for therapists (PDF, NL/EN).
- Gate: a test therapist who has never seen the app completes setup unaided in **under 15 minutes**.

---

## 8C. Inputs from the current Wix site (`/wix-export` folder)

The owner provides these before Phase 1. Check what's there, list what's missing, and never commit client personal data to git (add `/wix-export/private/` to `.gitignore`).

**Wix API key (preferred route):** the owner creates a Wix API key limited to this one site with **read-only** permissions, and stores it in `.env` as `WIX_API_KEY` with `WIX_SITE_ID` and `WIX_ACCOUNT_ID`. Never print, log or commit the key. Use it only in server-side migration scripts to pull media, page content, contacts and bookings into `/wix-export`. Stop and ask before any write call. After migration, remind the owner to **revoke the key**. The domain transfer and DNS remain manual steps for the owner (8).

- `brand/` — original logo files (SVG / high-res PNG), fonts and colour codes if known.
- `media/` — all images downloaded from the Wix Media Manager.
- `screenshots/` — a full-page screenshot of every page (desktop + mobile), as the visual reference.
- `sitemap.xml` / page list — used for redirects. The public text of each page can also be read directly from the live site.
- `therapists.xlsx` — one row per therapist: name, therapies, services, durations, prices, deposit, cancellation policy, bio (NL/EN), photo file name, contact email, KvK, BTW status.
- `dns/` — screenshot or export of all current DNS records from Wix, plus where email is hosted.
- `private/` — **only if migrating:** Wix contacts/bookings export (CSV). Handled per 11.2; import only after the owner confirms (16, row 15).

---

## 9. Payments & invoicing

### 9.1 Model: therapist is the seller (Option A — decided)
- Each therapist is the seller of their treatments; invoices are in the therapist's name with their KvK/BTW details.
- The centre is the platform: it invoices therapists for **room rent only**. Deposits flow 100% to the therapist minus the payment provider's transaction fee, which **the therapist pays** (deducted automatically from their payout; the centre pays nothing).

### 9.2 Payment provider
- iDEAL required (plus card/other methods optional). Must support **marketplace / split payments** so deposits go directly to each therapist's account (e.g. Mollie Connect — architect compares with alternatives and confirms iDEAL support, including the current iDEAL/Wero transition).
- Each therapist completes the provider's own onboarding (identity/KYC) once; admin starts it from the console.
- Hosted checkout only; webhooks are the source of truth, handled idempotently.

### 9.3 Client invoices (in therapist's name)
- At booking: **deposit receipt/invoice**.
- After the therapist records the balance payment: **final invoice** for the full session, showing deposit received and balance paid.
- Accountant confirms the exact deposit/final invoice structure and BTW timing before Phase 2 (16).
- Dutch requirements: sequential numbering per seller, date, seller name/address/KvK/BTW, client name, service and date, amount excl. BTW, BTW rate and amount or exemption ground, total. Immutable once issued; corrections only via credit notes.
- PDF in NL or EN, emailed and downloadable.

### 9.4 Room-rent invoicing (centre → therapist)
- Configured entirely in the **admin console**: rate per block (per room if needed), billing day, payment term, BTW treatment (set per accountant advice: room rent may be exempt or taxed).
- Monthly invoice per therapist generated automatically from reserved blocks, with admin review before sending (toggle: auto-send or review first).

### 9.5 Bookkeeping: integrate an API (decided)
- Connect an established Dutch accounting package (recommended: **Moneybird**; alternatives e-Boekhouden, Exact Online — architect confirms against the owner's accountant).
- It handles the **centre's** books: room-rent invoices, costs, bank feed and BTW return.
- Therapists' client invoices are generated by the app; offer per-therapist exports (and optional sync to their own accounting package later).

---

## 10. Financial dashboard (admin)

- Room-rent income, occupancy per room (booked blocks vs available), unpaid rent invoices.
- Bookings, deposits and outstanding balances across therapists (amounts only — no client medical data).
- **BTW overview per quarter** for the centre (from the accounting package), labelled "for review by your accountant".
- **Bank reconciliation:** read-only bank connection through a **licensed PSD2 account-information provider (AISP)** — preferably the accounting package's built-in bank feed (Moneybird uses this), otherwise a provider such as Ponto, Tink or Enable Banking (architect verifies current availability for the owner's bank). Never initiates payments, never stores bank credentials; remind the admin when consent must be renewed (typically every 90–180 days).
- Exports: CSV/XLSX.

---

## 11. Tech & compliance constraints

### 11.1 General
- Recommended stack (architect may propose alternatives, with reasons): Next.js + TypeScript, PostgreSQL (Supabase, **EU region**) with row-level security, i18n (NL/EN), EU transactional email, EU hosting, Playwright + unit tests.
- Money as integer cents; BTW rate/amount frozen per invoice line at issue.
- 2FA for admin and therapists; rate limiting; no secrets in the repo.
- WCAG 2.1 AA for the public flow.

### 11.2 Intake & medical data (GDPR/AVG special-category data)
- Intake data is **delivered to the therapist** and **stored only for the retention period the therapist sets**, then automatically and permanently deleted (scheduled job + audit log).
- Default delivery: email contains a **secure login link** to the intake, not the medical content itself (regular email isn't a safe channel for health data). Alternative: full content in the email over enforced TLS. Owner may switch.
- Financial records (invoices, payments) are stored **separately** and kept 7 years as required by tax law — deleting intake data never touches invoices.
- Admin cannot view intake data. Data processing agreements with every provider; privacy statement in NL + EN.
- Note for therapists (not enforced by the app): their own professional record-keeping duties (e.g. WGBO for registered care providers) remain their responsibility.

---

### 11.3 Running-cost budget
- Target: **roughly €80–120 per month** for the centre (hosting, database, email, accounting, domain), excluding per-transaction payment fees (paid by therapists).
- Prefer providers with predictable flat pricing and EU data residency. In PLAN.md, list every paid service with its monthly cost and what happens if usage grows to 35 therapists. Flag anything that would push the total above budget before using it.

---

## 12. Not in scope (for now)
- Automatic filing of BTW returns (prepared, not filed).
- Health insurance claims.
- Booking window rules (3.4), waitlist, online/Zoom sessions — unless decided otherwise.

---

## 13. Agent team (`.claude/agents/`)

| Agent | Owns | Must not touch |
|---|---|---|
| **architect** | PLAN.md, data model, ADRs, provider comparison (payments, accounting, bank, email, registrar) | feature code |
| **design-system** | design tokens, component library, light/dark mode, design review of every screen against 8A | business logic |
| **onboarding-docs** | admin & therapist setup wizards, in-app tours, empty states, help centre, handover guide (NL/EN) | DB schema |
| **site-rebuilder** | public pages from the current site, NL/EN, redirects | booking/finance logic |
| **scheduling-engine** | availability & validation module + DB constraints; **test-first** | UI, payments |
| **backend** | auth (magic links, 2FA), roles, API, migrations, RLS, retention jobs, calendar sync (7A) | UI styling |
| **booking-frontend** | public booking + checkout, client account pages | DB schema |
| **dashboard-frontend** | therapist + admin dashboards (non-financial) | DB schema |
| **payments-invoicing** | payment provider, marketplace onboarding, webhooks, refunds, deposit/final invoices, credit notes, room-rent invoicing | scheduling rules |
| **finance-dashboard** | financial dashboard, accounting API, bank feed, exports | payment flows |
| **notifications** | email templates (NL/EN), secure intake delivery, reminders, signed links | scheduling rules |
| **devops-domain** | hosting, environments, domain transfer checklist, DNS, email authentication | app features |
| **qa** | E2E tests for Section 15; reports, does not fix | production code |
| **privacy-security-reviewer** | reviews every phase against Section 11; can block a phase | production code |

Rules: each agent gets only the sections it needs; handoffs as written summaries in `handoffs/`; orchestrator merges and resolves conflicts. Payment, bank and accounting work uses **sandbox/test environments only** until go-live.

---

## 14. Phases & gates

1. **Plan** → *gate: human approval of PLAN.md. Accountant answers (16) are needed before Phase 2, not before Phase 1.*
2. **Foundation** — schema, auth, roles, i18n, seed data **+ design system** → *gate: migrations + RLS tests pass; human approves the component library and 3 key screen mock-ups (home, choose time, therapist calendar).*
3. **Scheduling engine** → *gate: all scheduling scenarios pass.*
4. **Booking flow + client accounts + notifications** → *gate: E2E booking works (no payment yet).*
5. **Payments + invoicing** (sandbox) → *gate: deposit, refund, balance, invoice and credit-note scenarios pass.*
6. **Dashboards** (client, therapist, admin) → *gate: therapist manages everything on a phone.*
7. **Room-rent invoicing + financial dashboard + accounting/bank** (sandbox) → *gate: test month reconciles with a hand calculation.*
8. **Website rebuild NL/EN + onboarding & walkthroughs** → *gate: human approves the site; untrained test therapist completes setup in < 15 min; test client books in < 2 min on a phone.*
9. **Go-live** — live keys, therapist payment onboarding, domain transfer → *gate: privacy/security sign-off, real €1 test deposit refunded, DNS and email checklist complete.*

---

## 15. Acceptance scenarios (minimum)

**Scheduling**
- Two therapists reserve the same block simultaneously → exactly one succeeds.
- Two clients book the same slot simultaneously → exactly one succeeds.
- Shared-room therapist without a block shows no slots.
- A session cannot run past the block end.
- Therapist sets buffer to 0 / 15 / 45 → slots update correctly; existing appointments untouched.
- Therapist changes price or duration → existing bookings keep their original terms.
- Paper-calendar window closes after one booking; manual booking entered by therapist blocks the slot.
- DST weekend → all slots correct.

**Payments & invoicing**
- Deposit payment abandoned → hold expires, no booking.
- Payment succeeds but browser closes → webhook confirms booking.
- Duplicate webhook → no duplicates.
- On-time cancellation → deposit refunded + credit note; late → fee retained per that therapist's policy; "no fee for new clients" rule respected.
- Therapist records balance → final invoice correct (deposit + balance = total).
- Invoice numbers sequential, no gaps, per seller.
- Monthly room-rent run → one invoice per therapist matching reserved blocks.

**Onboarding & self-booking**
- Therapist with incomplete setup is not visible or bookable; becomes bookable once the checklist is complete.
- Therapist opens new timeslots → they appear on the public site immediately; closes them → they disappear.
- Every tour is skippable and can be replayed from the help menu.

**Calendar sync**
- Busy event added in a therapist's Google calendar → that time disappears from the booking site.
- New booking → appears in the therapist's external calendar without intake details.
- Cancelled booking → removed from the external calendar.
- Therapist resets the feed link → old link stops working.

**Brand**
- Logo on every page is pixel-identical to the original file.

**Access & privacy**
- Therapist A cannot see therapist B's clients or revenue (API and DB level).
- Admin cannot open intake data.
- Retention period expires → intake data deleted, invoices intact.
- Emails and invoices arrive in the client's chosen language.

---

## 16. Decisions & defaults

Everything below is **decided**. Items marked *default* are sensible starting choices the owner can change at any time. Don't stop to ask about them.

| # | Topic | Decision |
|---|---|---|
| 1 | Manual bookings & balance | Therapists can enter phone/paper bookings and record the remaining payment after the session. |
| 2 | Deposit | **Required** for every online booking; amount fully the therapist's choice (minimum €1). |
| 3 | Transaction fee | Paid by the therapist (deducted from payout). |
| 4 | Commission | None. Centre income = monthly room rent only. |
| 5 | Brand | Existing logo used unchanged; existing brand colours kept; photos taken from the Wix media library. |
| 6 | Client accounts | Optional. Guest booking always possible. |
| 7 | Intake delivery | *Default:* email to therapist with a **secure link** to the intake (not the medical content itself). Owner may switch to full content in the email. |
| 8 | Intake retention | Therapist sets it; *default* 12 months. |
| 9 | Reminder | Therapist sets it; *default* 24 hours before. |
| 10 | Calendar sync | One-way feed for everyone + optional two-way Google/Outlook (7A). |
| 11 | Texts NL/EN | Claude drafts both languages from the current site; owner approves before go-live. |
| 12 | Accounting & bank | *Default:* Moneybird with its built-in bank connection; confirm with the accountant in Phase 7. |
| 13 | Current email hosting | devops-domain agent determines it from the DNS records (8C) before any domain change. |
| 14 | Shared-room blocks | First come, first served; admin can override or reassign. |
| 15 | Wix data | Start fresh for bookings. Client contacts are imported only if the owner asks. |
| 16 | Budget & launch | ≈ €80–120/month running costs; no fixed launch date, phases decide the pace. |
| 17 | Maintenance | Owner with Claude Code. Write `MAINTENANCE.md` (how to update, back up, renew keys, handle sync errors). |
| 18 | Waitlist, Zoom, rooms shown to clients | Later. Not in scope now (12). |

### Still needs a human (does not block Phase 1)
- **Accountant, before Phase 2:** structure of the deposit and final invoice, BTW timing, BTW on room rent, BTW status per therapist.
- **Owner:** original logo file, `therapists.xlsx`, new Wix API key in `.env`, accounts registered in the centre's name (0.1).
