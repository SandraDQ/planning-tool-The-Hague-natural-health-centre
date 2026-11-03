// Invoice rules of the demo store, like issue_invoice() and the money triggers in the DB:
// gap-free numbers per seller per year (D13), invoices frozen once issued (D10; only the
// paid amount and the "sent" stamp change afterwards), deposit invoice on payment,
// credit note on refund, final invoice when the balance is paid or the therapist sends it.

import { randomUUID } from "node:crypto";
import type { Appointment, BalancePayment, Id, Invoice } from "@/lib/domain/types";
import { creditNoteDraft, depositInvoiceDraft, finalInvoiceDraft, therapistParty, withPayments, type InvoiceDraft } from "@/lib/invoicing/drafts";
import { formatInvoiceNumber, invoiceYear, sequenceKey } from "@/lib/invoicing/numbering";
import { stableId } from "./ids";
import type { DemoState } from "./state";
import { DAY, addDays, iso, localDateOf, ms } from "./time";

/** Days a client has to pay a final invoice that is sent before the balance is paid. */
export const CLIENT_PAYMENT_TERM_DAYS = 14;

export function newInvoice(draft: InvoiceDraft, id: Id = randomUUID()): Invoice {
  return { ...structuredClone(draft), id, status: "draft", number: null, issuedAt: null, sentAt: null, sentTo: null };
}

/** Gives a draft its number and issue time. The only way an invoice becomes "issued". */
export function issueInvoice(state: DemoState, inv: Invoice, atMs: number): Invoice {
  if (inv.status === "issued") return inv;
  const year = invoiceYear(atMs);
  const key = sequenceKey(inv.sellerType, inv.sellerTherapistId, year);
  const next = (state.invoiceSequences[key] ?? 0) + 1;
  state.invoiceSequences[key] = next;
  inv.status = "issued";
  inv.number = formatInvoiceNumber(year, next);
  inv.issuedAt = iso(atMs);
  if (!state.invoices.includes(inv)) state.invoices.push(inv);
  return inv;
}

export const invoicesOf = (state: DemoState, appointmentId: Id) => state.invoices.filter((i) => i.appointmentId === appointmentId && i.status === "issued");

function context(state: DemoState, a: Appointment) {
  const client = state.clients.find((c) => c.id === a.clientId) ?? null;
  const therapist = state.therapists.find((t) => t.id === a.therapistId)!;
  const business = state.business.find((b) => b.therapistId === a.therapistId) ?? null;
  return { client, therapist, business, seller: therapistParty(business, therapist) };
}

/** Deposit paid online → deposit invoice (once). */
export function onDepositPaid(state: DemoState, a: Appointment, atMs: number, seeded = false): Invoice | null {
  if (a.snapshot.depositCents <= 0) return null;
  if (invoicesOf(state, a.id).some((i) => i.kind === "deposit")) return null;
  const { client, business, seller } = context(state, a);
  if (!client) return null;
  const draft = depositInvoiceDraft({ appointment: a, client, seller, business, paidOn: localDateOf(atMs) });
  return issueInvoice(state, newInvoice(draft, seeded ? stableId(`invoice:deposit:${a.id}`) : undefined), atMs);
}

/** Part or all of the deposit went back → credit note against the deposit invoice. */
export function onDepositRefunded(state: DemoState, a: Appointment, refundCents: number, atMs: number): Invoice | null {
  if (refundCents <= 0) return null;
  const original = invoicesOf(state, a.id).find((i) => i.kind === "deposit");
  if (!original) return null;
  const draft = creditNoteDraft({ original, refundCents: Math.min(refundCents, original.totalCents) });
  const credit = issueInvoice(state, newInvoice(draft), atMs);
  original.paidCents = Math.max(0, original.paidCents + credit.totalCents); // credit totals are negative
  return credit;
}

/** Money picture of one appointment, for "still to pay" lists. Cents incl. BTW. */
export function appointmentMoney(state: DemoState, a: Appointment) {
  const depositPaidCents = state.appointmentPayment[a.id] ? a.snapshot.depositCents : 0;
  const payments = state.balancePayments.filter((p) => p.appointmentId === a.id);
  const balancePaidCents = payments.reduce((n, p) => n + p.amountCents, 0);
  const dueCents = Math.max(0, a.snapshot.priceCents - depositPaidCents - balancePaidCents);
  return { priceCents: a.snapshot.priceCents, depositPaidCents, balancePaidCents, dueCents, payments };
}

/**
 * Keeps the final invoice in step with the balance payments. Creates it when the balance
 * is fully paid, or when `send` is true (therapist sends it before being paid). Once it
 * exists only its paid amount and payment notes change.
 */
export function syncFinalInvoice(state: DemoState, a: Appointment, atMs: number, options: { send?: boolean; seeded?: boolean } = {}): Invoice | null {
  const existing = invoicesOf(state, a.id).find((i) => i.kind === "final");
  const money = appointmentMoney(state, a);
  if (existing) {
    const updated = withPayments(existing, money.payments);
    existing.paidCents = updated.paidCents;
    existing.paidOn = updated.paidOn;
    existing.notes = updated.notes;
    return existing;
  }
  const balance = a.snapshot.priceCents - money.depositPaidCents;
  if (balance <= 0) return null; // the deposit was the whole price: the deposit invoice is the invoice
  if (!options.send && money.dueCents > 0) return null;
  const { client, business, seller } = context(state, a);
  if (!client) return null;
  const all = invoicesOf(state, a.id);
  const deposit = all.find((i) => i.kind === "deposit") ?? null;
  const credited = all.filter((i) => i.kind === "credit_note").reduce((n, i) => n - i.totalCents, 0);
  const draft = finalInvoiceDraft({
    appointment: a,
    client,
    seller,
    business,
    depositInvoice: deposit,
    depositCreditedCents: credited,
    payments: money.payments,
    dueOn: addDays(localDateOf(atMs), CLIENT_PAYMENT_TERM_DAYS),
  });
  return issueInvoice(state, newInvoice(draft, options.seeded ? stableId(`invoice:final:${a.id}`) : undefined), atMs);
}

// ------------------------------------------------------------------- seed --

/** Small deterministic hash → [0, 1), so seeded payments are the same on every instance. */
function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Seeds balance payments and invoices for the seeded appointments, in time order so the
 * numbers run in date order. `refMs` is the seed's reference instant.
 * About three in four past sessions are paid; the rest show up as "still to pay",
 * some with a final invoice already sent.
 */
export function seedInvoices(state: DemoState, refMs: number): void {
  type Event = { at: number; run: () => void };
  const events: Event[] = [];
  const methods: BalancePayment["method"][] = ["pin", "pin", "cash", "transfer", "tikkie"];
  for (const a of state.appointments) {
    if (!["confirmed", "completed", "no_show"].includes(a.status)) continue;
    const start = ms(a.session.start);
    if (state.appointmentPayment[a.id] && a.snapshot.depositCents > 0) {
      const bookedAt = Math.min(start - 3 * DAY, refMs - 3_600_000) - Math.floor(unit(`booked:${a.id}`) * 4) * DAY;
      events.push({ at: bookedAt, run: () => onDepositPaid(state, a, bookedAt, true) });
    }
    if (a.status !== "completed") continue;
    const end = ms(a.session.end);
    const r = unit(`paid:${a.id}`);
    if (r < 0.75) {
      events.push({
        at: end,
        run: () => {
          const { dueCents } = appointmentMoney(state, a);
          if (dueCents <= 0) return;
          state.balancePayments.push({
            id: `bp-${a.id}`,
            appointmentId: a.id,
            method: methods[Math.floor(unit(`method:${a.id}`) * methods.length)],
            amountCents: dueCents,
            paidOn: localDateOf(end),
          });
          syncFinalInvoice(state, a, end, { seeded: true });
        },
      });
    } else if (r < 0.87) {
      events.push({ at: end, run: () => syncFinalInvoice(state, a, end, { send: true, seeded: true }) });
    }
  }
  events.sort((x, y) => x.at - y.at).forEach((e) => e.run());
}
