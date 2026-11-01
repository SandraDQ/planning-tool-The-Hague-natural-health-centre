# Bookkeeping in the portal (phases 2 and 3)

Decisions: D40–D47 in DECISIONS.md. Demo mode only; no real bank, no real files storage.

## What is built
- **Pages**: `/admin/books` (the centre) and `/therapist/books` (add-on), each with `/bank` and `/btw`.
  Shared server components in `src/features/books/pages.tsx`; client parts in `CostSheet.tsx`,
  `BankActions.tsx`, `AddonManager.tsx`; server actions in `src/features/books/actions.ts`.
  Every page opens with a three-step welcome card (D30/D38).
- **Pure logic** (`src/lib/books/`): categories + default BTW, quarters and filing deadline,
  month/quarter totals (`summary.ts`), match suggestions (`matching.ts`), CSV, a small stored ZIP
  writer, receipt file checks, demo receipt PDFs. Tests: `src/lib/books/books.test.ts`.
- **Store**: `AppStore.books` (`BooksStore` in `src/lib/server/extensions.ts`), demo version in
  `src/lib/server/demo/books.ts` with seed (centre + Anna, Bram has asked for the add-on).
  Tests: `src/lib/server/demo/books.test.ts`.
- **Routes**: `GET /api/receipts/:costId` (owner only), `GET /api/books/export?quarter=&format=zip|csv&locale=`.
- **Add-on (phase 3)**: request by the therapist, switch on/off + fee by the admin (bottom of
  `/admin/books`), processing terms accepted before first use, fee as a 21% line on the rent
  invoice (`rentInvoiceDraft({ booksAddonFeeCents })`).
- Server actions accept up to 6 MB (`next.config.ts`), for receipts.
- E2E: `tests/e2e/books.spec.ts`.

## For Supabase (later)
Tables: `expenses` (owner_therapist_id null = centre, date, supplier, description, category,
gross/net/btw cents, btw_rate, receipt_path, bank_transaction_id), `bank_connections`
(provider, account id, iban, consent_until, last_sync_at; never credentials), `bank_transactions`
(provider id unique, booked_on, amount_cents, counterparty, description, match jsonb),
`books_addons` (therapist_id, status, since, terms_accepted_at), setting `books_addon_fee_cents`.
RLS: owner only (admin for the centre's rows); receipts in a private bucket, signed URLs.

## Not done yet (phase 4)
- Real bank feed through Enable Banking (sandbox): consent flow, daily sync, consent reminders.
- Text of the data-processing agreement (D45), and the fee amount (Q7).
- Accountant to confirm D41, D42, D47 and the centre's BTW position on room rent.
