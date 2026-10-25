# MVP · backend handoff: demo data store and demo login

*2026-10-25 · backend agent · nothing committed*

## What I built

| Path | What |
|---|---|
| `src/lib/server/data.ts` | `getStore(): AppStore`. This is the `DataStore` contract plus a few extras (below). Returns the in-memory demo store. If `SUPABASE_URL` **and** `SUPABASE_SERVICE_ROLE_KEY` are set, it throws instead, so a deployment with real keys never serves demo data (D22). |
| `src/lib/server/mode.ts` | `isDemoMode()` / `hasRealBackend()`. |
| `src/lib/server/extensions.ts` | `AppStore`, `TherapistExtras`, `AdminExtras`, `ClientStore` (methods the screens need that are not in the contract yet). |
| `src/lib/server/demo/` | `seed.ts` (fake data relative to "now"), `store.ts` (`createDemoStore(state, { now })`), `rules.ts` (wraps `@/lib/scheduling`), `series.ts` (weekly series → blocks via `expandBlockSeries`), `build.ts` (appointment + snapshot), `time.ts` (wraps the engine's tz helpers), `index.ts` (singleton, `resetDemoStore()`, `listDemoAccounts()`). |
| `src/lib/server/session.ts` | `getSession()`, `requireRole(role, locale)` (redirects to `/[locale]/login`), `homeFor(role)`, `signInDemo()`, `signOut()`. |
| `src/lib/server/session-token.ts` | HMAC-SHA256 signed cookie token (pure, tested). |
| `src/lib/server/auth-actions.ts` | Server actions: `signInAction`, `signOutAction`, `resetDemoAction` (admin only). |
| `src/app/[locale]/login/page.tsx` | Demo sign-in page in the site style (SiteShell + design system): admin, every therapist, the demo client, plus a note that real login comes with Supabase. |
| `src/design-system/components/DemoBanner.tsx` | "Demo — test data, nothing is real" (NL/EN). Exported from `@/design-system`. |
| `messages/{nl,en}/auth.json`, `messages/{nl,en}/demo.json` | Strings (`auth.login.*`, `demo.banner.*`). |
| `.env.example` | `DEMO_SESSION_SECRET=` |

## How demo mode works

- **State** is one module-level object (kept on `globalThis`, so dev hot reloads don't wipe it). It survives across requests in one server process and resets on restart or redeploy. On serverless hosting every instance has its own copy, so changes made on one instance may not show on another. That is fine for a demo, but use a single instance (or `next start`) when showing the MVP.
- **Seed** (`createSeedState(now)`) is **deterministic per week**. Everything is derived from Monday 00:00 (Europe/Amsterdam) of the current week, never from the time of day, and every seeded row has a stable id: readable keys (`th-anna`, `room-3`, `series-1:2026-11-02`, …) or UUIDv5 from a stable key (`appointment:<therapist>:<room>:<start>`, `src/lib/server/demo/ids.ts`). Two instances started in the same week (e.g. several Vercel instances) hold identical data, and sessions reference those stable ids. Only rows created at runtime get `randomUUID()`. The series horizon in `tick()` is week-based too. Contents:
  - Rooms 1, 2, 5 shared and 3, 4, 6 private. Block templates 08–12, 13–17, 18–22. The 13 therapies.
  - 7 fictional therapists, all named "Demo – …" with `@example.invalid` e-mails. **Anna de Vries** (acupuncture and Chinese herbs, private room 3, Mon/Tue/Thu 09–17). **Bram Jansen** (massage, room 4, Tue–Fri 10–18). **Carla Mendes** (psychology and coaching, room 6, Mon/Wed/Fri 09–16). **Daan Bakker** (reiki), **Eva Smit** (ayurveda and nutrition) and **Femke Visser** (homeopathy and orthomolecular, *paper calendar*) share rooms 1, 2 and 5, three therapists per room, through weekly series. **Gijs Mulder** (shamanism) is *invited*, not bookable and has no services.
  - Each therapist has services and session types (durations 30–90 min, prices, fixed or percentage deposits), a cancellation policy, and fake business details.
  - Block series run from last Monday to 8 weeks ahead. Femke has 4 paper windows (Mondays 14–16 inside her room 2 block); the first one is booked (`filled`).
  - About 250 appointments, from last week to four weeks ahead: `completed`/`no_show` before this week, `confirmed`/`cancelled` from this week on. Earlier days of this week stay `confirmed`, as if the therapist hasn't marked them yet. **No seeded holds**: a hold lives 15 minutes from when it is made, which would make instances differ. Holds come from the booking flow. Online bookings have fake intakes. The demo client **Lotte Willems** has one past and one upcoming appointment.
  - Rent: `fixed_monthly` for rooms 3/4/6 (€650/€600/€725), default `per_block` €40, BTW `exempt` (placeholder until the accountant answers). Rent settings: billing day 1, 14 days to pay, no auto-send.
- **Rules** come from the scheduling engine: `findSlots`, `validateAppointment`, `canReserveBlock`, `canReleaseBlock`, `expandBlockSeries`, `holdExpiresAt`. The store adds what the engine leaves to the DB:
  - Every call first runs `tick()`. It cancels expired holds (like pg_cron; this always happens before a block release, see engine S9) and extends the series horizon.
  - `holdSlot` checks the DB rules first (room layer, overlap → `slot_taken`, paper window), then checks that the start is one `findSlots` offers (working hours, grid, time off → `outside_block`). It holds for 15 min.
  - `confirmPayment` is idempotent per `paymentId`. Another paymentId on a paid booking → `invalid`. A cancelled or expired hold → `hold_expired`.
  - `failPayment` cancels a hold.
  - D18: when a booking is cancelled before its start, its intake is removed straight away.
  - Paper windows: an appointment stores `paperWindowId`. The window flips `open` ↔ `filled`; `closed` stays closed. A manual booking inside an open window takes it.
  - D25: manual bookings ignore time off. There is no warning flag yet, because `Appointment` has no field for one.
  - D14: a block with live bookings cannot be released by anyone. A room with future bookings cannot be made private, reassigned or deactivated (`block_has_appointments`).
  - Every return value is a deep copy.
- **Authorisation** per method from the `Session`. Admin methods need `role: "admin"`. Therapist methods need `role: "therapist"` and only reach their own rows (another therapist's appointment → `forbidden`). `listTakenBlocks` and `listRooms` hide other therapists' identities. Client methods only return the client's own data.
- **Intake** lives in `state.intakes`, apart from appointments. It is readable only through `therapist.readIntake(session, appointmentId)`, by the treating therapist. No admin method touches it (tested: `roomGrid` JSON has no intake fields).

## Demo accounts (login page `/{nl,en}/login`)

| Account | Lands on | Session |
|---|---|---|
| Owner (admin) | `/[locale]/admin` | `{ role: "admin", userId: "demo-admin" }` |
| Each therapist (incl. invited Gijs) | `/[locale]/therapist` | `{ role: "therapist", therapistId: "th-anna" … }` |
| Demo – Lotte Willems | `/[locale]/account` | `{ role: "client", clientId: "client-lotte" }` |

The cookie is `thnhc_demo_session`: httpOnly, SameSite=Lax, Secure in production, 7 days. It is HMAC-signed with `DEMO_SESSION_SECRET` (32+ chars). Without that secret, a random secret per process is used, so sessions end on restart. **Set `DEMO_SESSION_SECRET` on any shared deployment.** The cookie holds only the account id. The session is looked up from the demo state on every request.

## How to reset

- Restart the server (`pnpm dev` / redeploy). Or:
- Sign in as the Owner, then use **Reset demo data** at the bottom of `/login` (`resetDemoAction`). Sessions stay valid because the seed ids are stable.
- In code: `resetDemoStore()` from `@/lib/server/demo`.

## API notes for the frontends

```ts
import { getStore } from "@/lib/server/data";              // server only
import { getSession, requireRole } from "@/lib/server/session";
import { signOutAction } from "@/lib/server/auth-actions"; // <form action={signOutAction}><input type="hidden" name="locale" value={locale}/>…
import { DemoBanner } from "@/design-system";

const session = await requireRole("therapist", locale);   // redirects to /login when missing or wrong role
const store = getStore();
await store.therapist.listMyAppointments(session, { start, end }); // ranges up to 62 days
```

- Catch `DomainError` (`@/lib/domain/store`) and show friendly text by `code`: `slot_taken` ("Someone just took this time"), `block_taken`, `outside_block`, `block_has_appointments` ("Move or cancel the bookings first"), `hold_expired`, `forbidden`, `not_found`, `invalid` (message has an English detail for logs, not for users).
- **Booking:** `public.findSlots(sessionTypeId, range)` → `EngineSlot[]`, which has `paperWindowId`. Pass the chosen slot unchanged to `booking.holdSlot({ sessionTypeId, slot, client, intake })`. `intake.acceptedPolicy` and `healthDataConsent` must be `true`. Then the demo payment screen calls `booking.confirmPayment(id, "demo_tr_" + something)` or `booking.failPayment(id)`. If nothing is done, the hold expires after 15 min. `getAppointment(id)` is anonymous (the id is the capability), so only show the snapshot and status.
- **Therapist extras:** `listMySessionTypes`, `listMyTimeOff`, `readIntake`, `listMyPaperWindows`. The contract methods `listRooms`, `listBlockTemplates` and `listTakenBlocks` are implemented as the coordinator asked.
- **Admin extras:** `listPaperWindows`. `roomGrid` returns all rooms, reserved blocks and non-cancelled appointments overlapping the range (client ids only, no names, no intake).
- **Client:** `store.client.getMe(session)`, `store.client.listMyAppointments(session)` (newest first).
- Times are ISO UTC. Display them in Europe/Amsterdam.

## Tests

`src/lib/server/demo/store.test.ts` (16 tests) and `session-token.test.ts` (2 tests) cover:
- the seed is deterministic: two fresh seeds at the same `now`, and one later in the same week, are deeply equal (ids included), and stores built from them return the same room grid;
- the seed: every live appointment passes `validateAppointment`, every bookable therapist has slots, and each shared room is shared by 3 therapists;
- hold → confirm → idempotent confirm, and a different payment id is refused;
- a taken slot is refused and disappears from `findSlots`;
- an expired hold frees the slot and gives `hold_expired`; a failed payment frees the slot and purges the intake;
- starts outside the block, past the block end or off the grid are refused;
- consent is required;
- therapist A cannot read, cancel or see the clients of therapist B; role separation;
- `listTakenBlocks` is anonymised;
- admin `roomGrid` has no intake;
- a block with bookings cannot be released by the therapist or by admin; an expired hold does not keep a block; double block reservation → `block_taken`;
- the cookie token rejects forged, tampered, foreign-secret and expired tokens.

Last run: `pnpm test` 93/93 passed (7 files). `pnpm typecheck` clean (whole project). `pnpm lint`: 0 errors, 2 warnings in `scripts/wix-export/layout.mjs` (not mine). I checked by hand on a dev server: `/nl/login` and `/en/login` render; signing in as a therapist sets the cookie and redirects (303) to `/nl/therapist`; the page then shows "logged in as".

## Contract proposals (`src/lib/domain/` is not mine)

1. Add `TherapistExtras`, `AdminExtras.listPaperWindows` and a `client: ClientStore` to `DataStore` (now in `src/lib/server/extensions.ts`), and the same to the future Supabase store.
2. `readIntake` should log access (`intake_access_log`), like the DB function. The demo does not log.
3. D25 "warning flag": e.g. `addManualBooking` returns `{ appointment, warnings: ["time_off"] }`, or a separate `checkManualBooking()`.
4. `addManualBooking` takes `slot: Slot`, but therapists type free times. A plain `{ roomId, start }` input would be clearer.
5. A way to end or release a whole block series (only single blocks can be released now), and an admin method to move or cancel an appointment (the D14 "override").

## Open points

- **D24 is not in the engine yet:** shared-room slots are not narrowed by working hours. None of the seeded shared-room therapists have working hours, so the demo is unaffected. The scheduling engine should add it to `candidateWindows`, and then the store picks it up with no change.
- `messages/{nl,en}.json` → `site.login.*` (the site-rebuilder's placeholder strings) are no longer used by the login page. They can be removed by their owner.
- Online bookings reuse an existing client record with the same e-mail and do not change its details (nothing is returned to the guest). Manual bookings always create a new client record, owned by that therapist.
- The demo store is per process. If the MVP is shown on Vercel, either accept per-instance state or pin it to one instance.
