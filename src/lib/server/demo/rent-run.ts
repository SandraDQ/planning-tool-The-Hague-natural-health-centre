// Monthly room-rent run (9.4): the admin prepares draft invoices for a month from the
// rent rates and reserved blocks, reviews them, then sends them. Sending gives each its
// number and due date. Payment is marked by the admin until the bank feed matches it.

import type { Id, Invoice } from "@/lib/domain/types";
import { rentInvoiceDraft } from "@/lib/invoicing/drafts";
import { INVOICE_TEXT, longDate } from "@/lib/invoicing/text";
import { stableId } from "./ids";
import { issueInvoice, newInvoice } from "./invoicing";
import type { DemoState } from "./state";
import { DAY, addDays, localDateOf, localToUtcMs } from "./time";

export function monthBounds(day: string): { first: string; next: string } {
  const [y, m] = day.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, next };
}

export const rentInvoicesOf = (state: DemoState, monthFirstDay: string) =>
  state.invoices.filter((i) => i.kind === "room_rent" && i.rentMonth === monthFirstDay);

/**
 * (Re)builds the draft rent invoices of a month. Therapists who already have an issued
 * rent invoice for that month are skipped; earlier drafts are replaced.
 */
export function prepareRentRun(state: DemoState, day: string, atMs: number, seeded = false): Invoice[] {
  const { first, next } = monthBounds(day);
  state.invoices = state.invoices.filter((i) => !(i.kind === "room_rent" && i.rentMonth === first && i.status === "draft"));
  const billed = new Set(rentInvoicesOf(state, first).map((i) => i.buyerTherapistId));
  const dueOn = addDays(localDateOf(atMs), state.rentSettings.paymentTermDays);
  const drafts: Invoice[] = [];
  for (const therapist of state.therapists) {
    if (billed.has(therapist.id)) continue;
    const draft = rentInvoiceDraft({
      therapist,
      business: state.business.find((b) => b.therapistId === therapist.id) ?? null,
      email: therapist.publicEmail ?? state.therapistLoginEmails[therapist.id] ?? null,
      rooms: state.rooms,
      rates: state.rentRates,
      blocks: state.blocks,
      monthFirstDay: first,
      monthNextDay: next,
      dueOn,
      localDayOf: (iso) => localDateOf(Date.parse(iso)),
    });
    if (!draft) continue;
    const inv = newInvoice(draft, seeded ? stableId(`invoice:rent:${first}:${therapist.id}`) : undefined);
    state.invoices.push(inv);
    drafts.push(inv);
  }
  return drafts;
}

/** Issues draft rent invoices: number, issue date, due date = today + payment term. */
export function issueRentInvoices(state: DemoState, ids: Id[], atMs: number): Invoice[] {
  const text = INVOICE_TEXT.nl;
  const issued: Invoice[] = [];
  for (const inv of state.invoices) {
    if (inv.kind !== "room_rent" || inv.status !== "draft" || !ids.includes(inv.id)) continue;
    inv.dueOn = addDays(localDateOf(atMs), state.rentSettings.paymentTermDays);
    inv.notes = [text.rentPay(longDate(inv.dueOn, inv.locale))];
    issued.push(issueInvoice(state, inv, atMs));
  }
  return issued;
}

/** Last month's rent, sent on the billing day; all paid except one, so the overview has an open invoice. */
export function seedRentInvoices(state: DemoState, refMs: number): void {
  const thisMonth = monthBounds(localDateOf(refMs)).first;
  const lastMonth = monthBounds(addDays(thisMonth, -1)).first;
  const billingDay = `${thisMonth.slice(0, 8)}${String(state.rentSettings.billingDay).padStart(2, "0")}`;
  const at = Math.min(localToUtcMs(billingDay, "09:00"), refMs - DAY);
  const drafts = prepareRentRun(state, lastMonth, at, true);
  const issued = issueRentInvoices(state, drafts.map((d) => d.id), at);
  for (const inv of issued) {
    if (inv.buyerTherapistId === "th-bram") continue; // stays open
    inv.paidCents = inv.totalCents;
    inv.paidOn = localDateOf(at + 3 * DAY);
  }
}
