# MVP · booking-frontend handoff: client booking flow + client area

*2026-10-25 · booking-frontend agent · nothing committed*

## What I built

The client booking flow at `/[locale]/book`. It keeps the current site's look, with `SiteShell` (the site header and footer) and the `DemoBanner` while demo mode is on. It works on a phone in 4 steps plus the confirmation, so **home → paid confirmation takes 5 screens**. The test run took about 9 seconds of clicking, well under 2 minutes.

| Step | Route | What happens |
|---|---|---|
| 1 Treatment | `/book` (`?by=therapy` groups by therapy) | One list of every bookable session type, grouped **by therapist** (default) or **by therapy**. Each row shows the duration, full price, deposit and what is "at the session". Tapping a row goes straight to the time step, so service and session type are chosen together. |
| 1 (deep link) | `/book/therapist/[slug]`, `/book/therapy/[id]`, also `/book?therapist=<slug>` / `/book?therapy=<id>` (these redirect) | The same list, filtered. These are for the site's therapist sections and therapy pages. |
| 2 Time | `/book/time?st=<sessionTypeId>[&week=YYYY-MM-DD&day=…]` | A week strip plus slots from `store.public.findSlots`, server-side. The first visit opens on the first week that has a free time (it searches 8 weeks ahead); the strip goes up to 26 weeks ahead. Each start time is shown once. The phone has a sticky "Continue" bar. `&taken=1` shows "Someone just took this time". |
| 3 Your details | `/book/details?st=…&start=<ISO>` | Fields from master prompt 5.5. A signed-in client's details are filled in and the new/returning question is skipped, because it is worked out from their past appointments. The optional fields sit in a closed "More about you" section. The therapist's cancellation policy and the health-data consent come with their checkboxes. Checking happens in the browser and again on the server, with an error summary that links to each field. Submitting runs the `holdBooking` server action, which re-finds the exact slot (room/block) on the server and calls `store.booking.holdSlot`. |
| 4 Deposit | `/book/pay/[id]` | The **demo payment page (D23)** is labelled "Demo payment — no money moves". It shows a 15-minute countdown from `holdExpiresAt`. Buttons: **Pay with iDEAL (demo)** calls `confirmPayment(id, "demo_<uuid>")`, **Payment fails** calls `failPayment` (the demo store then releases the slot), and **Abandon** leaves the hold as it is. When the hold runs out, the page offers "Choose a time again". |
| Confirmed | `/book/confirmed/[id]` | Shown only when the status is `confirmed`. It has "What happens next" (email, the therapist prepares, a reminder N hours before, the balance due at the session), deposit paid, balance due, the therapist's email plus the centre's phone, the cancellation policy, and the reference. |
| Client area | `/account` | Requires the client role (`requireRole`). Lists upcoming appointments and the last 10 past ones, with a status badge and deposit/balance. Cancel has a confirm step that says whether the deposit comes back (on time vs late, from the policy). **The Cancel button is hidden until the store has a client cancel method** (see the open questions). |

**Slot taken:** if the time is gone when the client submits, the server action sends them back to the time step with a warning. Per D27, only first name, last name, e-mail and phone are kept in `sessionStorage`, and the draft is cleared on the confirmation page. The complaint, date of birth, address, comments and consents are never stored in the browser, so they have to be typed again. Loading the form also rewrites any older draft down to those four fields. Per D26, a signed-in client's name, e-mail and phone come from their account, are read-only ("change them in your account") and are never stored as a draft. Binding the booking to `session.clientId` on the server is the backend's part, in `server/actions.ts`. If the details page is opened for a slot that is already gone, it shows the same message instead of the form.

**Who can see a booking:** the pay and confirmation pages show only for the browser that made the hold (an httpOnly cookie `thnhc_bookings` holding appointment ids only) or for the signed-in client who owns it. Anyone else gets a 404.

**Files**
- `src/app/[locale]/book/**`, `src/app/[locale]/account/**` (layouts add `DemoBanner` + `SiteShell`)
- `src/features/booking/`:
  - `server/actions.ts`: hold, the demo pay outcomes, client cancel
  - `server/catalog.ts`: the bookable catalogue, read once per request
  - `server/slots.ts`
  - `server/ownership.ts`
  - `server/client-area.ts`: adapter for `store.client`
  - `server/pages.ts`
  - `components/*`
  - `validation.ts`, `time.ts` (Amsterdam time zone helpers), `money.ts`, `policy.ts`
- `messages/{nl,en}/booking.json` (namespace `booking`; the NL text is my draft)
- Design system:
  - new `Notice`, an inline alert/callout (already committed by the orchestrator).
  - `Avatar` initials now skip non-letter words: the demo names "Demo – Anna …" showed "D–".

## How to test

```
pnpm dev   # or pnpm build && pnpm start
/nl/book  /en/book  →  pick a row → pick a time → fill in → Continue to deposit → Pay with iDEAL (demo)
/en/book/therapist/demo-bram-jansen        (deep link)
/en/account                                (needs the demo client sign-in; the login page is not built yet)
```

- `pnpm lint`: clean (2 warnings in `scripts/wix-export`, not mine).
- `tsc`: my files are clean. At the time of writing the only errors came from `.next/types` for other agents' routes, and from the backend/dashboard files while they were mid-edit.
- `pnpm build`: passes (built in an isolated copy so I didn't overwrite the `.next` another agent was serving).
- **Playwright** (390×844, production build, EN and NL): the full flow, validation errors, abandon, payment fails, slot taken (two browsers), and a signed-in client with prefill → account. 0 page errors.
- Screenshots are in `/mnt/project-files/thnhc-plan/mvp/booking/`:
  - `en-*` and `nl-*`, numbered 00–06 by step
  - `en-10…14`: account and prefill
  - `desktop-01…03`

## Open questions / gaps

1. **Store contract: a client cancel is missing.** `ClientStore` (`src/lib/server/extensions.ts`) has `getMe` and `listMyAppointments` but no cancel. The client area expects `client.cancelAppointment(session, appointmentId, "client"): Promise<Appointment>`, which should apply the therapist's policy: refund on time, keep the fee when late. When it appears, the Cancel button shows automatically (`src/features/booking/server/client-area.ts`). Reschedule is not built.
2. **No public lookup by id** for a session type or therapist. I load the whole catalogue (therapists → services → session types) per request, which is fine for a handful of therapists. `public.getSessionType(id)` would be cleaner later.
3. **Deposit before the hold** is calculated in the UI (`money.ts`: fixed, or percent of the price, rounded, capped at the price). After the hold, the UI shows `snapshot.depositCents`. Please confirm the rounding matches the database.
4. **Therapist's extra intake questions** (5.5) are not in the domain types, so they are not asked yet.
5. **Abandon:** in the demo nothing is called and the hold simply expires. Should a real Mollie "canceled" status release the slot straight away instead? Today `failPayment` already releases it.
6. **Site links (site-rebuilder):** the therapist sections and therapy pages can deep-link to `/book/therapist/<slug>` or `/book/therapy/<id>`, since the slugs/ids come from the store. `SiteShell` doesn't yet show the signed-in client's name or a link to `/account`.
7. The labels in the demo seed repeat the duration, for example "Massage 60 min" next to "60 min". That is a data issue, not a UI one.
