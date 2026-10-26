# MVP · dashboards handoff: admin portal and therapist dashboard

*2026-10-25 · dashboard-frontend agent · nothing committed*

## What I built

Both areas use the current site's look (D19): flat white cards with sand lines, brand green, Jost headings, Lato Light body text. They use only design-system components plus a few additions listed below. Every page calls `requireRole(...)` and shows `DemoBanner`, which is rendered by the shared `DashboardShell`. All strings are in NL and EN.

### Admin: `/[locale]/admin/…` (desktop first, also works on phones)
| Route | What |
|---|---|
| `/admin` | Overview for this week: occupancy of the shared rooms (reserved blocks out of all possible blocks), with a bar per room; who holds each private room; appointment count; each renter's onboarding status (invited / setting up / ready) and whether they are bookable; quick links. |
| `/admin/grid` | **Room grid**: rooms × the 7 days of a week (`?week=YYYY-MM-DD`). For each block time a cell shows either the reserved block (therapist, time, number of appointments, a "weekly" icon) or a free "+" slot. Past days cannot be assigned. A **private room** cell shows who holds it and that day's appointments. Tapping a block opens a sheet with time + service of each appointment (no client details, no intake) and **Release**. With live bookings the D14 message shows straight away and Release is disabled; the store's `block_has_appointments` error is caught too, in case the data is stale. A **free slot** opens Assign: choose a therapist, "every week" (series) or just once; `block_taken` gets a friendly message. On phones the grid becomes a day strip plus one card per room. |
| `/admin/rooms` | Rooms list; add/edit sheet (number, name, shared/private, in use, therapist for a private room). Block times are listed and can be edited or added (start/end/active). |
| `/admin/renters` | Renters list with badges (onboarding, bookable, paper calendar, private room); **Invite** sheet (name, e-mail, therapies). |
| `/admin/renters/[id]` | Practice card (display name, therapies, bookable, paper calendar) and the **admin-only business & tax details** (legal name, trade name, address, KvK with 8-digit check, btw-id with `NL123456789B01` check, KOR). |
| `/admin/rent` | **Price per room** (D12): `fixed_monthly` or `per_block`, amount excl. VAT, VAT treatment (exempt/21/9), valid-from. Default per-block price for shared rooms. Planned future prices show as "Planned". Invoice settings: billing day, payment term, *review first* or *send automatically*. **Expected rent per renter** for a month (`?month=`), clearly labelled **Estimate**: fixed monthly rent for assigned private rooms + reserved blocks × the room's or default rate valid on each block's date; excl. VAT / VAT / total; blocks without a price are flagged. |
| `/admin/therapies` | Therapies (NL + EN name, shown/hidden), with how many therapists use each one. |

### Therapist: `/[locale]/therapist/…` (mobile first, bottom tab bar on phones)
| Route | What |
|---|---|
| `/therapist` | **Calendar** built from the mock-up (`?week=&day=`). **Day view**: timeline with the therapist's windows (reserved blocks, plus working hours when they have a private room), appointment cards, free gaps ("Free 09:30–12:00 · room for N sessions of X min", via the engine's `sessionsThatFit`), time off shaded. **Week view**: a list on phones, a 7-column grid from tablet up. Tapping an appointment opens the **details sheet**: client name/e-mail/phone, service, price / deposit / still to pay, plus actions: **Cancel** (confirm step; "therapist cancels = full deposit refund"), **No-show**, **Record payment** (method PIN/cash/transfer/Tikkie, amount defaulting to the balance, date). "Add booking" is a floating button above the tab bar on phones and a header button on desktop. |
| Add-booking sheet | Service → session type → date → start times from `public.findSlots`, filtered to this therapist (same engine as online booking). **"Another time"** lets them type any start inside their own window that day, including during their time off, which shows the **D25 warning** but still saves. Client: first name, last name, e-mail, phone (all required, because the store requires them). |
| `/therapist/blocks` | Their next 8 weeks of blocks, grouped by week, with the number of appointments and **Release** (confirm sheet; with bookings it shows the D14 text and Release is disabled). "What fits in a block" card: per block time × session type, `sessionsThatFit` with their buffer. **Reserve** sheet: pick a day, then a room + block time as radio cards marked Free / Taken / Yours (from `listTakenBlocks`, which is anonymised), "every week", and a live "N sessions fit in this block" preview for a chosen session type. |
| `/therapist/settings` | List of topics + **business details read-only** (set by the centre). |
| `…/settings/services` | Services (NL/EN name, therapy, NL/EN description, deposit fixed € or %, archive) and their session types (NL/EN name, duration in 5-minute steps, price). Note that existing bookings keep their terms (D6). |
| `…/settings/availability` | Weekly working hours (one range per day; the text differs for private and shared rooms, following D24), buffer (0–60 min) with a live 4-hour-block preview, time off (list of upcoming + add). |
| `…/settings/policy` | Cancellation policy (notice hours or working days, fee % or €, no fee for new clients, own NL/EN text, live summary sentence), reminder hours, intake retention (30 d … 2 y, or until deleted). |
| `…/settings/profile` | Bio NL/EN and public e-mail. The name is set by the admin; photo upload comes later. |

### Shared code (`src/features/dashboard/`)
- `components/DashboardShell.tsx`: demo banner, skip link, header with the logo, "Admin" / "My practice", the signed-in name, View website, **Sign out** (the backend's `signOutAction`), NL/EN. The section menu sits in its own row on desktop, like the site's menu row. Phones get a menu sheet; therapist phones also get the bottom tab bar. It also contains the `ToastProvider`.
- `components/Page.tsx` (`PageHeading`, `DashboardPage`), `components/Meter.tsx`.
- `actions/admin.ts`, `actions/therapist.ts`: server actions. Each one calls `requireRole` and returns `ActionResult` (`{ok, data}` or `{ok:false, code}`). `revalidatePath` then refreshes the screen. `changeRentRate` closes the running price the day before the new one starts, so prices never overlap (D12).
- `useRunAction.ts`: pending state + success/error toast. Errors map to `<area>.errors.<DomainErrorCode>`.
- `time.ts` (Amsterdam ⇄ UTC, DST-safe, week/month ranges), `money.ts`, `rent.ts` (estimate), `sessions.ts` (wraps `sessionsThatFit` from `@/lib/scheduling`), `rooms.ts` (no more "Room 1 · Room 1").
- `therapist/calendar-data.ts`: server-only loader for one week.

### Design-system additions (consistent with the existing ones)
- `BottomNav` + `SectionNav` (+ `isNavItemActive`, `AppNavItem`) in `components/BottomNav.tsx`, exported from the index.
- New icons: `Home, Grid, Sliders, Users, Door, Euro, Leaf, LogOut, Pencil, Repeat, Layers`.
- `ToastProvider aboveTabBar`: lifts toasts above the phone tab bar. Default behaviour is unchanged.

## How to test
```
pnpm typecheck && pnpm lint      # pass (lint: 2 warnings in scripts/wix-export/layout.mjs, not mine)
pnpm build && pnpm start         # passes (built in an isolated copy, because other agents build in .next at the same time)
```
Open `/nl/login` → **Owner (admin)** → `/nl/admin`; or a therapist (Daan/Eva/Femke share rooms; Anna/Bram/Carla have private rooms) → `/nl/therapist`.

**Playwright click-through:** this ran against `next start` with no console or page errors and no horizontal scroll at 390 px. It covered:
- **Admin:** assign a block, see the D14 notice, invite a renter, edit a room, change a price.
- **Therapist:** record a payment, add a manual booking, reserve a block, open the release sheet, all settings pages, and the EN and desktop views.

**Screenshots:** `/mnt/project-files/thnhc-plan/mvp/dashboards/`. Admin `admin-*.png` at 1280×800 (plus 2 phone shots); therapist `therapist-*.png` at 390×844 @2x (plus one desktop shot).

## Gaps and questions
1. ~~**Admin can't see the client's first name** in the room grid: `roomGrid` returns client ids only, and there is no admin method to get first names. The grid shows time + service. Add `clientFirstName` to the roomGrid appointments if the owner wants it (7A allows first name + service).~~ **Done:** the grid sheets show the first name (`GridAppointment.clientFirstName`).
2. ~~**No list of balance payments** (`TherapistStore` has none), so the sheet can't show "already paid" and lets them record a payment again. The store also accepts a payment for a future appointment. Suggest `listBalancePayments(session, appointmentIds)` and a rule "only after the session starts".~~ **Done:** the sheet lists recorded payments, shows what is still to pay, and hides "Payment" until the session has started.
3. ~~**Manual bookings need e-mail and phone** (store rule). Is that right for phone/paper clients without e-mail?~~ **Done:** only the first name is required; e-mail is checked only when given.
4. **Admin can assign a block on a past date** (the store allows it). The UI hides past free slots; the store could refuse it too.
5. **Working hours**: one range per day in the UI (e.g. 09–12 and 14–17 is not possible yet). The contract allows several; I can add "+ another range" if wanted.
6. ~~**Time off can't be removed** (there is no delete method). The list shows upcoming time off only.~~ **Done:** each upcoming item has a delete button.
7. ~~**Paper-calendar windows** (`openPaperWindow`) have no admin screen yet. That is left out of this MVP; it would go on the renter page.~~ **Done:** `/admin/paper` ("Paper calendar" in the admin nav) lists upcoming windows with status and bookings, opens a window inside one of the therapist's blocks (next 8 weeks) or their private room, and closes open windows without bookings.
8. Ranges are capped at 62 days by the store, so Blocks shows 8 weeks ahead.
9. Date and time inputs follow the browser's locale (the screenshots show US format because headless Chromium runs in en-US; Dutch browsers show dd-mm-yyyy and 24h).
10. **No-show (QA finding, fixed):** "No-show" only shows once the session has started, also for past sessions already marked "done". Before that, a hint explains it. If the store still refuses, the toast says "You can mark a no-show once the session has started." `tests/e2e/therapist.spec.ts` was updated to match.
