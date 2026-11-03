# Invoicing · phase 1 handoff

*2026-11-01 · invoicing thread · branch `claude/project-thread-095bf9` (based on `claude/project-thread-5fstmm` @ 0a24a13)*

Plan for the whole money side (invoices → accounting tool → paid add-on → bank link): Claude Doc "Invoicing and accounting: phased plan". Decisions D31–D38, open question Q6.

## What is built (demo mode)

| Area | Where |
|---|---|
| Types `Invoice`, `InvoiceLine`, `InvoiceParty`, `BtwTreatment`; `TherapistBusiness.btwTreatment/exemptionGround` | `src/lib/domain/types.ts` |
| Pure rules: BTW split (gross ↔ net, cents exact), numbering `YYYY-NNNN` (Amsterdam year), status (paid/open/overdue), drafts for deposit / final / credit note / rent, NL+EN invoice words | `src/lib/invoicing/` |
| PDF (pdf-lib, standard fonts, WinAnsi-safe) | `src/lib/invoicing/pdf.ts` |
| Demo store: issue with gap-free sequence, deposit invoice on `confirmPayment`, credit note on refunds, final invoice on full payment or "send", rent run (prepare/send/mark paid), seed (¾ of past sessions paid, last month's rent sent, Bram's still open) | `src/lib/server/demo/invoicing.ts`, `rent-run.ts`, `store.ts` |
| Store contract additions | `src/lib/server/extensions.ts`: `therapist.listMyInvoices / listAppointmentInvoices / listMyRentInvoices / listOutstanding / sendFinalInvoice`, `admin.listRentInvoices / prepareRentInvoices / sendRentInvoices / setRentInvoicePaid`, `client.listMyInvoices`, `invoices.getForViewer / listUnsent / markSent` |
| E-mail | `src/lib/server/invoicing/deliver.ts` (`deliverPendingInvoices()`, called after every action that can issue an invoice) → `mailer.ts` (demo outbox). **TODO:** once PR #2 (`src/lib/email/send.ts`) is merged, make `sendInvoiceEmail` call `sendEmail` and delete the local outbox; the admin E-mails page already labels kind `invoice`. |
| PDF download | `GET /api/invoices/:id` (`?download=1`), 404 for anyone who may not see it (D31) |
| Screens | `/therapist/invoices` (Payments: welcome card, still to pay + "Payment received" / "Send invoice", month invoices, rent from the centre), `/admin/invoices` (who owes rent, month run: prepare → check → send, mark paid), `/account` "My invoices", invoice links + "Send invoice" in the appointment sheet, BTW fields on the renter page. Nav items in `DashboardShell`. Strings in `messages/{nl,en}/invoices.json`. |

## Tests
- `src/lib/invoicing/invoicing.test.ts`, `src/lib/server/demo/invoicing.test.ts` (numbering, BTW, deposit + final = price, credit note, KOR, access rules, rent run).
- `tests/e2e/invoices.spec.ts` (therapist flow, admin rent run, PDF access incl. 404s, axe).

## For the Supabase implementation
- Migration 0006 already has `invoices`, `invoice_lines`, `invoice_sequences`, `rent_runs`. Add: `invoices.rent_month date`, `invoices.paid_cents`, `invoices.paid_on`, `invoices.sent_to`, `invoices.notes jsonb`; `therapist_business.btw_treatment` + `exemption_ground`. Paid/sent columns must stay writable after issue (the immutability trigger should allow only those).
- `listUnsent/markSent` become a queue job; render the PDF once and store `pdf_path`.

## Not done (next phases)
- Accounting tool (receipts, categories, BTW per quarter, export), add-on billing on the rent invoice, bank link (Enable Banking) and automatic matching.
- No-show fees and partial refunds by the therapist have no invoice flow yet.
