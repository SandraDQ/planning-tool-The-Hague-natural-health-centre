# MVP · privacy-security-reviewer handoff

*2026-10-25 · nothing committed*

- **What:** I reviewed the MVP application layer (server actions, pages, demo session, booking ownership, mode switch, headers, build output). The full report is `handoffs/reviews/mvp-app-review.md`.
- **Verdict:** PASS for the demo with fake data. 7 findings must be fixed before real data: F1–F3, F6, F7, F11, F12. 3 must be fixed before go-live: F4, F5, F8.
- **Proof tests:** `src/lib/server/__security__/mvp-app.test.ts` (12 tests). Run it with `pnpm test src/lib/server/__security__`. Each `HOLE:` test passes while its hole exists, so turn it around with the fix.
- **Open questions:** see the end of the review (F2: how a guest booking links to an account; F6: whether the complaint may be retyped).
