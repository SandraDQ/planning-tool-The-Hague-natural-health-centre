# Phase 2 · privacy-security-reviewer handoff

**What I did:** reviewed the Phase 2 migrations, seed, test support, `src/`, `.gitignore`/`.env.example` and git history. I added proof tests in `tests/db/90_review.sql` and wrote the review in `handoffs/reviews/phase2-review.md`. **Verdict: BLOCK** (F1 admin can read intake data; F2 no 2FA check in RLS).

**How to test:** `pnpm test:db`. Tests named `HOLE:` in `90_review.sql` pass while the hole exists. Invert them when the fix lands.

**Open questions:** F2 (enforce aal2 in the DB, or only in the app?), F5 (purge intakes early on which cancellations?), and the note on admin visibility of appointment therapy types (owner/DPO).
