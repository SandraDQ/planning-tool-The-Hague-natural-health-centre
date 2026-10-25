# CLAUDE.md

Booking, room and finance platform for The Hague Natural Health Centre (THNHC).

- **Source of truth:** [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md). Read it before any work.
- **Plan:** [`PLAN.md`](PLAN.md). **Decisions log:** [`DECISIONS.md`](DECISIONS.md). Log every new decision there.
- **Current phase:** viewable MVP in demo mode (D21–D23): site copy, booking, admin portal, therapist dashboard on fake data. Real services (Supabase, Mollie, Moneybird, email) are connected later.
- **Secrets:** only in `.env` (git-ignored). Never print, log, commit or ask for them in chat. Names are in `.env.example`.
- **Ask, don't guess** when something is ambiguous. Payments, bank and accounting use sandbox only until go-live.
- **Handoffs** between agents go in `handoffs/` as short written summaries.
