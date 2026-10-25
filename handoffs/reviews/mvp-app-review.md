# MVP application layer · privacy & security review

*2026-10-25 · privacy-security-reviewer · branch `claude/project-thread-5fstmm` at `0500a85` (plus the uncommitted `openPaperWindow` / `closePaperWindow` / `deleteTimeOff` actions in the working tree) · nothing committed*

## Verdict: **PASS for the demo MVP with fake data**

Nothing here blocks showing the MVP with seeded, fictional data. Every page and server action checks the role. The store checks ownership of every id that comes in from a form or URL. Admin never gets intake or client contact details. No secret reaches the client bundle.

Several findings **must be fixed before real client data flows**: F1, F2, F3, F6, F7, F11 and F12. Others must be fixed **before go-live**: F4, F5 and F8. If real data were connected without those fixes, this would be a BLOCK.

**Scope:** `src/lib/server/**`, `src/features/booking/server/**`, `src/features/dashboard/actions/**` (plus the calendar loader), `src/app/[locale]/{admin,therapist,account,book,login}/**`, `src/middleware.ts` and `next.config.ts`. The database was reviewed in `phase2-review.md`.

**Proof tests:** `src/lib/server/__security__/mvp-app.test.ts` has 12 tests, all passing. Tests named `HOLE:` pass **while the hole exists**, so turn each one around when its fix lands. Tests named `OK:` guard properties that hold today. Full suite: `pnpm test` 10 files, 129 tests passed.

**Live checks:** I ran an isolated production build (`git worktree` in the scratchpad, `pnpm build` with canary values for every secret, then `next start`):
- No canary, seed data, intake marker or `process.env.*` reference appears in `.next/static`.
- No admin, therapist, account or booking page was prerendered. All of them are dynamic.
- Unauthenticated GETs to `/nl/admin`, `/nl/admin/grid`, `/nl/admin/renters/th-anna`, `/nl/therapist` and `/nl/account` return 307 to `/nl/login`. A hand-made RSC request with a forged `Next-Router-State-Tree` returns no data either.
- The sign-in server action sets `thnhc_demo_session` with `HttpOnly; Secure; SameSite=lax; Max-Age=604800`. The same action posted with `Origin: https://evil.example` is refused: Next's CSRF origin check works.
- **No security headers are sent.** `X-Powered-By: Next.js` is present (F5).
- With a hand-set `thnhc_bookings` cookie holding a **computed** seeded appointment id, `/en/book/confirmed/<id>` returns 200 and shows the demo client's booking (F1).

---

## Findings

### F1 · MEDIUM · must fix before real data · Booking pages and demo payment trust any appointment id in an unsigned cookie
- **Where:**
  - `src/features/booking/server/ownership.ts:12-15` and `:29-33`: the cookie is a plain comma list of ids, and the check is only `includes(id)`.
  - `src/lib/server/demo/store.ts:361-384`: `confirmPayment` and `failPayment` take no session, and `confirmPayment` accepts a caller-chosen `paymentId`.
  - `src/lib/server/demo/ids.ts:9` together with `seed.ts:510`: seeded ids are UUIDv5 of `therapistId:roomId:start`, which are all public.
- **Scenario:**
  - Anyone who knows or computes an appointment id can view its pay and confirmation pages. They set the cookie by hand (proven live and by `A2 HOLE`).
  - The same person can press "Payment fails" or "Abandon" and release **someone else's hold** (`A2 HOLE` on `failPayment`).
  - Booking ids also travel in URLs (`/book/pay/<id>`, `/book/confirmed/<id>`), so they end up in browser history, screenshots and shared links.
  - With real data, the confirmation page shows the therapist, service, time, price and, for the signed-in owner, the first name.
- **Fix:**
  1. Make the cookie value unforgeable. One option is to HMAC each id with the session secret (the same helper as `session-token.ts`). Better: a random per-hold access token, stored hashed on the appointment and checked on every pay or confirm request.
  2. In the real store, `failPayment` and `confirmPayment` must be **server-to-server only**. Mollie's webhook gives only the payment id. The server then fetches the payment from the Mollie API, takes the status, amount and appointment id from that response, and checks the amount against `snapshot.depositCents`. Never take a `paymentId` or status from the browser.
  3. Keep `getAppointment` off any route that does not run the ownership check.

### F2 · MEDIUM · must fix before real data · Online bookings attach to an existing client record by e-mail alone
- **Where:**
  - `src/lib/server/demo/store.ts:152-158` (`findOrCreateClient` reuses any client with the same e-mail, case-insensitive).
  - `src/features/booking/server/actions.ts:50-62` (a signed-in client's booking is not bound to `session.clientId`; the typed e-mail decides).
- **Scenario:** A stranger books with Lotte's e-mail address. The booking appears in Lotte's account, and Lotte can cancel it. Lotte's therapist sees Lotte's name, phone and e-mail next to the **stranger's** intake text (`A1 HOLE`). A signed-in client who types another address books into someone else's (or a new) record. With real data that means wrong medical context attached to a real person, plus account spam. Nothing leaks back to the guest, which is good.
- **Fix:**
  - When signed in, always use `session.clientId` and ignore the typed e-mail. Show it read-only, with "change in your account".
  - For guests, create a **new** client record per booking (or a "pending" record). Link it to an existing account only after the e-mail owner confirms through a magic link. Phase 3 Supabase Auth can do this on first sign-in.
  - The same rule must go into the Supabase store and the `book_slot` RPC.

### F3 · MEDIUM · must fix before real data (and before any public URL) · Demo mode is on unless two specific variables are set
- **Where:** `src/lib/server/mode.ts:4-10`.
- **Scenario:** Demo mode means anyone can sign in as admin from `/login`, with no password. Today it stays on in these cases (`A4 HOLE`):
  - in `NODE_ENV=production` next to `DATABASE_URL`, `MOLLIE_API_KEY`, `EMAIL_API_KEY` and `MONEYBIRD_TOKEN`;
  - when only `SUPABASE_URL` is set, for example when the service key is forgotten or misnamed (`NEXT_PUBLIC_SUPABASE_*`).

  As soon as e-mail or payments are connected while Supabase is not, a public deployment would serve an open admin login. D22 says demo mode "cannot be enabled in production with real keys present". It currently checks only the Supabase pair.
- **Fix (fail closed):**
  - `isDemoMode()` returns true only when `DEMO_MODE === "1"` **and** none of `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MOLLIE_API_KEY`, `MONEYBIRD_TOKEN`, `EMAIL_API_KEY`, `GOOGLE_CLIENT_SECRET` or `MICROSOFT_CLIENT_SECRET` is set.
  - Throw at startup (e.g. in `instrumentation.ts`) when `DEMO_MODE=1` and any of them is set. Also throw when `NODE_ENV=production` with `DEMO_MODE=1` and `DEMO_SESSION_SECRET` missing or shorter than 32 characters.
  - Add `DEMO_MODE=` to `.env.example`.

### F4 · MEDIUM · before go-live · No rate limiting or bot protection on public server actions
- **Where:** `src/features/booking/server/actions.ts:37` (`holdBooking`), the demo payment actions, and `src/lib/server/auth-actions.ts:13` (sign-in; for real auth this means the magic-link request).
- **Scenario:** One anonymous script holds **every** online slot of a therapist for two weeks (`A3 HOLE`). It can renew each hold every 15 minutes, and every call adds a client row and an intake row. Master prompt 11.1 requires rate limiting.
- **Fix:**
  - Per-IP and per-e-mail limits, e.g. 5 holds per 15 min per IP and at most 2 open holds per e-mail. Use Upstash or Vercel KV, or a Postgres table.
  - A cap on open holds per therapist per client.
  - Cloudflare Turnstile or hCaptcha on the details step after N attempts.
  - The same limits on magic-link requests in Phase 3.

### F5 · MEDIUM · before go-live (cheap, can be done now) · No security headers
- **Where:** `next.config.ts:49-53`. Live response headers have no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options` or `Permissions-Policy`, but do have `X-Powered-By: Next.js`.
- **Scenario:**
  - The dashboards and pay page can be framed (clickjacking on "Cancel", "Release", "Pay").
  - Booking ids in URLs rely on browser defaults for the `Referer`.
  - There is no second line of defence against injected script.
- **Fix:** add to `nextConfig`. This was checked against what the app loads today: self-hosted fonts and images, and the Google Maps iframe.

```ts
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Next's App Router injects inline bootstrap scripts; move to a nonce (middleware) later to drop 'unsafe-inline'.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com",        // MapBand embed
  "frame-ancestors 'none'",
  "form-action 'self'",                      // Phase 5: add https://www.mollie.com (form-action also covers the redirect to checkout)
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // add "; preload" once the domain is final
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Personal pages: never leak the URL (booking ids) and never cache.
        source: "/:locale(nl|en)/:area(admin|therapist|account|book|login)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  async redirects() { return wixRedirects; },
};
```
The `/design` layout's inline theme script is covered by `'unsafe-inline'`. With a nonce CSP later, it needs the nonce too. After adding the headers, run the Playwright click-through once to check that nothing is blocked (the iframe, fonts, server actions).

### F6 · MEDIUM · must fix before real data · Booking details (incl. the complaint) stay in `sessionStorage` after a failed or abandoned payment
- **Where:** `src/features/booking/components/DetailsForm.tsx:13-14` and `:25-28`, which save `reason`, `dateOfBirth`, `address` and `comments`. The draft is cleared only by `ClearDraft` on the confirmation page.
- **Scenario:** On a shared or family computer, someone abandons the payment or the hold expires. The health complaint, date of birth and address stay readable in that tab until it is closed, and they are restored into the form for the next person.
- **Fix:** keep only the non-health fields (name, e-mail, phone) in the draft, which is enough for the "slot taken" round trip. Or clear the draft on the pay page as soon as the hold exists, and on fail or abandon. If the complaint must survive "slot taken", pass it back from the server action instead of storing it in the browser.

### F7 · LOW · must fix before real data · Unknown errors are logged whole, and `detail` goes back to the browser
- **Where:** `src/features/dashboard/actions/run.ts:16` (`console.error(..., e)`) and `:12` (`detail: err.message`).
- **Scenario:** With Supabase, PostgREST/pg errors carry row values, for example `Key (email)=(jan@…) already exists` or a failing row in `details`. These end up in hosting logs, which are a processor outside the DPA scope of the database. Today all other logs print only error codes, which is good.
- **Fix:** log `{ name, code, digest }` only. Map database errors to `DomainError` in the store layer. Send `detail` only in demo/dev, or drop it.

### F8 · LOW · before go-live · Demo session cookie: no revocation, no `__Host-` prefix
- **Where:** `src/lib/server/session.ts:39-51`, `src/lib/server/session-token.ts`.
- **Assessment:** The signing is sound:
  - HMAC-SHA256, compared with `timingSafeEqual` after a length check (the length of a valid signature is fixed and public).
  - The payload is parsed only after verification; `v`, `a` and `iat` are type-checked.
  - The token expires after 7 days with 60 s clock skew.
  - An empty or short secret never verifies (`A5 OK`). A short `DEMO_SESSION_SECRET` is ignored silently, and a random per-process secret is used instead.
  - Flags are `HttpOnly`, `SameSite=Lax`, and `Secure` in production (verified live).

  Remaining gaps:
  - Sign-out only deletes the cookie, so a copied token stays valid for 7 days.
  - Without the `__Host-` prefix a sibling subdomain could set the cookie.
  - A short secret should be reported, not silently replaced.
- **Fix:** acceptable for the demo. For real auth (Supabase), see the D17 note below. If the demo cookie lives on: name it `__Host-thnhc_demo_session`, log a startup warning for a short secret, and include a server-side "session generation" so a reset or sign-out invalidates old tokens.

### F9 · LOW · `photoUrl` accepts protocol-relative URLs
- **Where:** `src/lib/server/demo/store.ts:400` (`/^(https:\/\/|\/)/` matches `//tracker.example/x.gif`), proven by `A7 HOLE`.
- **Scenario:** A therapist profile photo pointing at a third-party host loads on the public booking pages. That is a tracking pixel (IP and timestamp of every client), and it will also be blocked by the CSP in F5.
- **Fix:** allow only `/` paths that do not start with `//`, or the storage bucket origin. Upload goes through Supabase Storage anyway.

### F10 · LOW · `setBusiness` stores unknown fields (mass assignment)
- **Where:** `src/lib/server/demo/store.ts:778` (`clone(business)` is stored whole), proven by `A7 HOLE`.
- **Scenario:** Harmless in memory. If the Supabase store does `upsert(business)` the same way, any column the client sends is written, for example a future `iban` or a status flag.
- **Fix:** whitelist the fields, as `upsertRoom` and `updateTherapist` already do, here and in the Supabase implementation.

### F11 · LOW · must fix before real data (tracking) · Intake reads are not logged
- **Where:** `src/lib/server/demo/store.ts:655-659` (`readIntake`). The backend handoff already notes this.
- **Fix:** the Supabase store must read intake only through the DB function that writes `intake_access_log`.

### F12 · LOW · must fix before real data (tracking) · 2FA (D17) is not yet enforced in the app layer
- **Where:** `src/lib/server/session.ts:11-12` (TODO) and `requireRole`.
- **Fix:** when Supabase Auth lands, `requireRole("admin" | "therapist")` must check the session's `aal === "aal2"` and send the user to the TOTP step otherwise. That is D17's second layer; RLS already enforces it in the database.

### F13 · INFO · hardening
- `src/lib/server/demo/index.ts` and `demo/store.ts` do not `import "server-only"`. A future client component importing them by mistake would bundle the seed, including fake intakes. The build output is clean today. Add the import to `demo/index.ts`, `data.ts` (already has it) and `mode.ts`.
- `resetDemoAction` can be run by anyone, because anyone can become admin in the demo. That is by design (D22). Note it for whoever shows the demo.
- The admin room grid sends full `Appointment` objects (price, deposit, opaque `clientId`) plus `clientFirstName` to the client component. That is within 7A/10: amounts and first name, no contact details and no intake (`A6 OK`).

---

## What was checked and holds

- **Role checks:**
  - Every page under `admin/`, `therapist/` and `account/` calls `requireRole` itself, not only in the layout, which matters because layouts are skipped on client navigation.
  - Every exported server action in `features/dashboard/actions/*.ts` (including the new uncommitted ones) and in `features/booking/server/actions.ts` checks the role or ownership before calling the store.
  - The store checks the role again (`asAdmin` / `asTherapist` / `asClient`).
- **IDOR:** appointment, block, service, session type, time off and client ids passed by a therapist or client are checked against the session in the store, and another owner's id gives `forbidden` (`A6 OK`, plus `store.test.ts`). `listTakenBlocks` and `listRooms` hide other therapists.
- **Admin data:** no store method returns intake to admin. `roomGrid` holds no last name, e-mail, phone or intake text (`A6 OK`). Business details are admin-only; the therapist view is read-only.
- **Amounts:** deposit, refund and fee are always calculated on the server from the appointment snapshot and the policy frozen at booking. No form sends an amount, except the therapist's own balance payment, which is the amount they received.
- **Open redirects:** all `redirect()` targets are fixed internal paths. `locale` is whitelisted (`nl`/`en`), the ids and slugs from query strings are `encodeURIComponent`-ed into a path, and there is no `next` or `returnTo` parameter.
- **CSRF:** server actions reject foreign `Origin` (verified live).
- **Secrets:** `.env` is git-ignored (`.gitignore:2-3`) and not tracked. Only `.env.example` and `next-env.d.ts` match env patterns in `git ls-files`. No client component references `process.env`; `NEXT_PUBLIC_SITE_URL` is the only public variable. The canary build leaked nothing to `.next/static`. `.env` was not opened.
- **Logs:** booking actions log error codes only, no personal data.
- **Middleware:** only next-intl. Auth does not depend on it, so middleware-bypass bugs do not apply. Next 15.5.28 is past the CVE-2025-29927 fix.
- **Fail closed:** with both Supabase keys set, `getStore()` throws and `getSession()` returns null, so no demo data is served.

## Order of work

1. **Now (cheap):** F5 (headers), F13 (`server-only`).
2. **Before real data:** F1, F2, F3, F6, F7, F10 (in the Supabase store), F11, F12.
3. **Before go-live:** F4, F8 (replaced by Supabase Auth), and a re-review of the Mollie webhook (F1 point 2) in Phase 5.

## Open questions

- F2: should a guest booking with a known e-mail be linked to that account automatically after the person confirms by magic link, or always stay a separate client record until the therapist merges them?
- F6: is it acceptable that the complaint has to be retyped after "someone just took this time", if it is no longer kept in the browser?
