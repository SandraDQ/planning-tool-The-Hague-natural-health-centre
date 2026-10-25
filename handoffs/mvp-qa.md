# MVP · QA handoff: Playwright E2E tests for the demo-mode MVP

*2026-10-26 · qa agent · nothing committed · tested commit `1c5588e` (isolated copy, demo mode, `next start`)*

## Result

**90 tests: 79 passed, 9 failed, 2 skipped** (both projects, run on Monday 26 Oct 00:47 Amsterdam time).

| Area | Pass | Fail | Skip |
|---|---|---|---|
| Site (NL + EN pages, logo, console errors, redirects, 360px overflow) | 51 | 0 | 0 |
| Booking (phone) | 4 | 2 | 1 |
| Therapist (phone) | 5 | 1 | 1 |
| Admin (desktop) | 7 | 0 | 0 |
| Access (both projects) | 12 | 0 | 0 |
| Accessibility (axe, both projects) | 0 | 6 | 0 |

Booking home → paid confirmation took **5 screens** (`/book` → `/book/time` → `/book/details` → `/book/pay/…` → `/book/confirmed/…`) and **4.4 s** of scripted clicking, so the 8A quality bar is met.

Every failure below is a soft check: the core action worked. The test goes red because something around it is wrong or missing.

Screenshots: `/mnt/project-files/thnhc-plan/mvp/qa/` (`<project>-<name>.png`).

## Issues

### 1. Client cancel: no confirmation, no refund amount afterwards, and the cancelled booking moves to "Past". Medium
- **Page:** `/en/account` (demo client Lotte)
- **Steps:**
  1. Log in as Demo – Lotte Willems.
  2. Book Bram's 60-min massage two weeks ahead and pay.
  3. Open `/en/account` and press **Cancel appointment** on that booking. The panel says "You are cancelling in time, so your deposit of €20.00 is refunded."
  4. Press **Yes, cancel**.
- **Expected:**
  - "Your appointment is cancelled." appears.
  - The refunded amount from the store's `ClientCancellation.refundCents` is shown.
  - The appointment stays in date order, marked Cancelled.
- **Actual:**
  - No message appears. The list re-renders (`revalidatePath`) and unmounts the `CancelAppointment` component, so its "done" notice never shows.
  - The amount appears only as the estimate before confirming. The actual refund is never shown.
  - The cancelled **future** appointment (10 Nov) is listed under **Past**, above a real past one (19 Oct). The cause is `account/page.tsx`: `past = everything not upcoming`.
- **Screenshots:** `mobile-booking-cancel-confirm.png`, `mobile-booking-cancelled.png`

### 2. "Abandon" shows the hold-expired text. Low
- **Page:** `/en/book/pay/[id]?status=abandoned`
- **Steps:**
  1. Book any slot up to the deposit page.
  2. Press **Abandon**.
- **Expected:** "You left the payment" with text saying the time was released. The slot is released, which is correct.
- **Actual:** "Your time is no longer held. **The 15 minutes to pay have passed**…" This happens because `demoPayAbandoned` cancels the hold, and the released branch of `book/pay/[id]/page.tsx` (around lines 113–116) only tells `failed` apart from expiry. The unused `abandonedText` ("You can still pay while we hold your time") also contradicts the behaviour now.
- **Screenshot:** `mobile-booking-pay-abandoned.png`

### 3. "Mark as no-show" stays enabled for a session that hasn't started, then shows a misleading error. Low
- **Page:** `/en/therapist` (Anna), with an appointment later this week
- **Steps:**
  1. Open the appointment.
  2. Press **No-show**. The sheet warns "This session hasn't started yet."
  3. Press **Mark as no-show**.
- **Expected:** The button is disabled, or a clear message appears.
- **Actual:** The button is enabled. The store correctly refuses (the status stays Confirmed), but the toast says "Something in the form isn't right. Check the fields and try again." (`invalid`).
- **Screenshots:** `mobile-therapist-no-show-future.png`, `mobile-therapist-no-show-future-reopened.png`

### 4. Accessibility (axe, WCAG 2.1 A/AA): serious violations
Nothing critical was found. Full JSON is in `test-results/a11y/<project>-<page>.json` after a run.
- **color-contrast**, home page, both languages. Medium.
  - `#nature`: the "NATURE INSPIRED HEALTHCARE" title is taupe `#9f8c82` on `#e8e4d5`. That is **2.51:1**; large text needs 3:1.
  - Phone only: the quote `figcaption` is white on `#6d8c77`, **3.7:1** at 22px. It needs 4.5:1, because 22px normal weight is not "large".
- **label-content-name-mismatch** (WCAG 2.5.3 label in name). Low–medium. Voice-control users say what they see, and these elements don't respond to it:
  - The language switch shows "NL"/"EN" but is named "Nederlands"/"English". This affects every page with the site header.
  - NL header: "Boeken" is named "Afspraak maken".
  - Booking menu rows (`/book`): the aria-label leaves out visible text, such as the deposit line.
  - Day buttons on the time step: "Mon 26" is named "Monday, October 26".
- **document-title** on `/book/confirmed/[id]` (desktop): seen in 1 of 3 runs, then gone. Probably a timing issue with streamed metadata. Low, unconfirmed.

### 5. Gaps, not bugs (the dashboard agent is building these now)
- **Balance payments:** after you record a payment, the sheet still shows the full "Still to pay" and lets you record it again (dashboards handoff #2). Screenshot: `mobile-therapist-payment-saved.png`.
- The rest of the coordinator's list was not tested against `1c5588e` because it isn't there yet: optional client details on manual bookings, deleting time off, and the paper-window screen.

## Not covered / skipped
- **Server-side hold expiry:** skipped. The production demo store uses the real clock, and there is no test hook to move it. The browser-side countdown **is** tested with `page.clock`: after 16 minutes the page offers "Choose a time again" and hides Pay. The server-side release is covered by `src/lib/server/demo/store.test.ts`. A dev-only "expire now" hook would let E2E cover it.
- **No-show on a started appointment:** skipped in this run because it was Monday 00:47, so no confirmed session had started yet this week. The test finds one by itself whenever one exists, for example later on a weekday.
- Real login (magic link and TOTP), Mollie, email and calendar sync are not built yet.

## What passed (highlights)
- **Site.** All 11 pages load with HTTP 200 and the right `lang`, in NL and EN, at 390 and 1280:
  - home, therapies, conditions, about, events, blog, contact, privacy, booking, login and book
  - each has a visible, loaded logo image and **no console or page errors**
  - the menu works on desktop, and the menu sheet works on phones
  - `/copy-of-meditation-video` → 308 → `/`, and `/{nl,en}/copy-of-meditation-video` → `/{locale}`; other old Wix URLs → `/en/...`
  - **no horizontal overflow at 360px** on any of these pages, nor on `/services-1` or the time step
- **Booking.** These all work:
  - a guest books end to end, and the slot is then gone for a second visitor
  - while held, the slot is hidden from others; **Payment fails** and **Abandon** both free it straight away
  - a returning client (Lotte) gets name, e-mail and phone filled in, and isn't asked new/returning
- **Therapist (phone).** All of these work:
  - the calendar shows appointments in day and week view
  - a manual booking is added and appears in the calendar
  - a balance payment is saved
  - a one-off block is reserved, with a "sessions fit" preview, and then released
  - a block with bookings shows the D14 text, and Release is disabled
- **Admin (desktop).** All of these work:
  - the overview and the room grid show all 6 rooms
  - a free block is assigned to Eva and appears in the grid
  - a block with bookings can't be released from the grid
  - an edited room is saved and stays after a reload
  - a private room with future bookings can't be made shared
  - Room 1 gets a per-block price (€45) and Room 2 a fixed monthly price (€500, 21% VAT)
  - a renter's business details are saved, after the KvK and btw-id format errors show
- **Access.** All of these hold:
  - signed-out visitors are sent to login from `/admin`, `/admin/renters/[id]`, `/therapist`, `/therapist/*` and `/account`
  - a therapist can't open `/admin`, and a client can't open `/therapist` or `/admin`
  - Bram's booking at `/book/confirmed/<id>` and `/book/pay/<id>` shows nothing to Anna, to Lotte or to an anonymous visitor
  - **Anna can't cancel Bram's appointment**: the test rewrites her own Cancel server action to carry Bram's appointment id, and his booking stays confirmed
  - the admin room-grid sheet shows no client contact details or intake

## How to run

```
pnpm test:e2e                                   # builds HEAD in a separate git worktree (tests/e2e/serve-isolated.sh) and serves it on :3300
E2E_BASE_URL=http://localhost:3300 pnpm test:e2e  # against a server you already started (demo mode, no .env)
pnpm test:e2e --project=mobile tests/e2e/booking.spec.ts
```
- `playwright.config.ts` has two projects: `mobile` (390×844, Pixel 7 touch) and `desktop` (1280×800).
  - Tests tagged `@mobile` or `@desktop` run in only one of them.
  - It uses the preinstalled Chromium `/opt/pw-browsers/chromium` when it is there. No `playwright install` is needed.
  - It runs with `workers: 1`, because the demo data is per process. Each spec resets it first with "Reset demo data" as the owner.
- Use `localhost`, not `127.0.0.1`. The demo session cookie is `Secure`, and Chromium accepts that over http only on localhost.
- The `pnpm test:e2e` path with no server was checked once. It created the worktree, built HEAD `187b0b5`, served it on :3301 and passed the redirect tests.
- `serve-isolated.sh`:
  - It refuses to run in the main tree or in a folder with a `.env`, because demo mode needs no real keys.
  - It copies `package.json` and the lockfile across, so test-only dependencies work before they are committed.
  - `E2E_DIR` and `E2E_PORT` override the folder and the port.
- Screenshots go to `E2E_SHOT_DIR` (default `/mnt/project-files/thnhc-plan/mvp/qa/`). Failure traces and screenshots go to `test-results/e2e/`, and the JSON report to `test-results/e2e-results.json`.

## Files
- `playwright.config.ts`
- `tests/e2e/`:
  - `helpers.ts` (sign-in, reset, booking helpers, Amsterdam dates)
  - `site.spec.ts`, `booking.spec.ts`, `therapist.spec.ts`, `admin.spec.ts`, `access.spec.ts`, `a11y.spec.ts`
  - `serve-isolated.sh`
- `package.json`: the script `test:e2e`, and the devDependency `@axe-core/playwright@4.14.0` (lockfile updated)

## Open questions
1. Should Abandon keep the hold (the copy says "you can still pay") or release it (the code does)? The backend and the task say release. If so, the copy should change.
2. Do you want a test-only "expire holds now" hook in demo mode, so E2E can cover the server-side 15-minute expiry?
