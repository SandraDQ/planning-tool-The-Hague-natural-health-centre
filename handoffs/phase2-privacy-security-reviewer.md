# Phase 2 · privacy-security-reviewer handoff

**What I did:** first review: **BLOCK** (F1 admin could read intake data, F2 no 2FA check in the DB, plus F3–F10). Re-review of migration `20261025000010_review_fixes.sql`: all ten findings closed. **Final verdict: PASS.** Details in `handoffs/reviews/phase2-review.md`.

**How to test:** `pnpm test:db` (11 files, 384 assertions). `tests/db/90_review.sql` holds the original proofs (now inverted by the backend). `tests/db/91_rereview.sql` attacks the fixes: other F1 paths, aal1 on every table, the SECURITY DEFINER allow-list, the anon allow-list, default privileges, and the purge and its log. I checked F4 (the migration fails without pg_cron) by hand on a separate local cluster.

**Open questions:** D18 scope (should admin cancellations purge intakes early? see O1). Owner/DPO: does the admin calendar show the therapy type? Confirm aal2 behaviour against the real Supabase project in Phase 4 (O4).
