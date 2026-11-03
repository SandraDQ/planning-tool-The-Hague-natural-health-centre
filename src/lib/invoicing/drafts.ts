// Builds the content of each kind of invoice. Pure: the data layer adds id, number,
// issue date and sending. Rules (9.3, 9.4, 11.1):
// - client prices include BTW; the deposit invoice is the deposit, the final invoice is the
//   whole session minus the deposit already invoiced, so deposit + final = the session price;
// - a refund of (part of) a deposit gets a credit note against the deposit invoice;
// - room rent is priced excl. BTW and billed per room (fixed monthly) or per reserved block.

import type {
  Appointment,
  BalancePayment,
  BtwTreatment,
  Client,
  Id,
  Invoice,
  InvoiceLine,
  InvoiceParty,
  Locale,
  RentRate,
  Room,
  RoomBlock,
  Therapist,
  TherapistBusiness,
} from "@/lib/domain/types";
import { lineFromGross, lineFromNet, totalsOf } from "./btw";
import { INVOICE_TEXT, dateTime, euro, longDate, monthName } from "./text";

/** Everything except what is set when the invoice is created and issued. */
export type InvoiceDraft = Omit<Invoice, "id" | "status" | "number" | "issuedAt" | "sentAt" | "sentTo">;

/** The centre as seller of room rent. KvK and BTW number come with the setup wizard (8B step 1). */
export const CENTRE_PARTY: InvoiceParty = {
  name: "The Hague Natural Health Centre",
  address: "Badhuisstraat 224, 2584 HN Den Haag",
  email: "info@thehague-naturalhealthcentre.com",
  kvk: null,
  btwNumber: null,
};

export function therapistParty(business: TherapistBusiness | null, therapist: Pick<Therapist, "displayName" | "publicEmail">, email?: string | null): InvoiceParty {
  const name = business ? (business.tradeName ? `${business.tradeName} (${business.legalName})` : business.legalName) : therapist.displayName;
  return {
    name,
    address: business?.address ?? null,
    email: email ?? therapist.publicEmail ?? null,
    kvk: business?.kvk ?? null,
    btwNumber: business?.btwNumber ?? null,
  };
}

export function clientParty(client: Client): InvoiceParty {
  return { name: `${client.firstName} ${client.lastName}`.trim(), address: null, email: client.email || null };
}

/** BTW on a therapist's client invoices: KOR means no BTW; otherwise the admin's setting. */
export function clientBtw(business: TherapistBusiness | null, locale: Locale): { treatment: BtwTreatment; ground: string | null } {
  const text = INVOICE_TEXT[locale];
  if (business?.kor) return { treatment: "exempt", ground: text.korGround };
  const treatment = business?.btwTreatment ?? "exempt";
  return { treatment, ground: treatment === "exempt" ? business?.exemptionGround?.trim() || text.unknownGround : null };
}

function base(
  partial: Pick<InvoiceDraft, "sellerType" | "sellerTherapistId" | "kind" | "locale" | "seller" | "buyer" | "lines" | "notes" | "dueOn"> &
    Partial<Pick<InvoiceDraft, "appointmentId" | "creditedInvoiceId" | "rentMonth" | "buyerClientId" | "buyerTherapistId" | "paidCents" | "paidOn">>,
): InvoiceDraft {
  return {
    appointmentId: null,
    creditedInvoiceId: null,
    rentMonth: null,
    buyerClientId: null,
    buyerTherapistId: null,
    paidCents: 0,
    paidOn: null,
    ...partial,
    ...totalsOf(partial.lines),
  };
}

const serviceLabel = (a: Appointment, locale: Locale) => {
  const service = a.snapshot.serviceName[locale];
  const type = a.snapshot.sessionTypeName[locale];
  return type && type !== service ? `${service} – ${type}` : service;
};

/** Deposit invoice, issued when the online deposit is paid. It is paid at issue. */
export function depositInvoiceDraft(input: {
  appointment: Appointment;
  client: Client;
  seller: InvoiceParty;
  business: TherapistBusiness | null;
  paidOn: string;
}): InvoiceDraft {
  const { appointment: a, client } = input;
  const locale = client.locale;
  const text = INVOICE_TEXT[locale];
  const btw = clientBtw(input.business, locale);
  const deposit = a.snapshot.depositCents;
  return base({
    sellerType: "therapist",
    sellerTherapistId: a.therapistId,
    kind: "deposit",
    locale,
    appointmentId: a.id,
    buyerClientId: client.id,
    seller: input.seller,
    buyer: clientParty(client),
    lines: [lineFromGross(text.deposit(serviceLabel(a, locale), dateTime(a.session.start, locale)), deposit, btw.treatment, btw.ground)],
    notes: [text.paidOnline(euro(deposit, locale), longDate(input.paidOn, locale))],
    dueOn: null,
    paidCents: deposit,
    paidOn: input.paidOn,
  });
}

/**
 * Final invoice for the whole session, minus the deposit invoice (if any).
 * The total is what the client still pays at or after the session.
 */
export function finalInvoiceDraft(input: {
  appointment: Appointment;
  client: Client;
  seller: InvoiceParty;
  business: TherapistBusiness | null;
  depositInvoice: Pick<Invoice, "number" | "lines" | "totalCents"> | null;
  /** Deposit refunds already credited (cents incl. BTW), so they are not deducted twice. */
  depositCreditedCents?: number;
  payments: BalancePayment[];
  dueOn: string;
}): InvoiceDraft {
  const { appointment: a, client } = input;
  const locale = client.locale;
  const text = INVOICE_TEXT[locale];
  const btw = clientBtw(input.business, locale);
  const lines: InvoiceLine[] = [
    lineFromGross(text.session(serviceLabel(a, locale), dateTime(a.session.start, locale), a.snapshot.durationMin), a.snapshot.priceCents, btw.treatment, btw.ground),
  ];
  const notes: string[] = [];
  const dep = input.depositInvoice;
  const deductible = dep ? dep.totalCents - (input.depositCreditedCents ?? 0) : 0;
  if (dep && dep.number && deductible > 0) {
    // Same BTW treatment as the deposit invoice, so the BTW already charged is reversed exactly.
    const depLine = dep.lines[0];
    lines.push(lineFromGross(text.lessDeposit(dep.number), -deductible, depLine.btwTreatment, depLine.exemptionGround));
  }
  const draft = base({
    sellerType: "therapist",
    sellerTherapistId: a.therapistId,
    kind: "final",
    locale,
    appointmentId: a.id,
    buyerClientId: client.id,
    seller: input.seller,
    buyer: clientParty(client),
    lines,
    notes,
    dueOn: input.dueOn,
  });
  return withPayments(draft, input.payments);
}

/** Updates paid amount and the payment notes of a final invoice. */
export function withPayments(draft: InvoiceDraft, payments: BalancePayment[]): InvoiceDraft {
  const text = INVOICE_TEXT[draft.locale];
  const sorted = [...payments].sort((x, y) => (x.paidOn < y.paidOn ? -1 : 1));
  const paidCents = sorted.reduce((n, p) => n + p.amountCents, 0);
  const notes = sorted.map((p) => text.balancePaid(euro(p.amountCents, draft.locale), p.method, longDate(p.paidOn, draft.locale)));
  if (draft.totalCents > 0 && paidCents >= draft.totalCents) notes.push(text.paidInFull);
  else if (draft.dueOn) notes.push(text.payBy(longDate(draft.dueOn, draft.locale)));
  return { ...draft, notes, paidCents, paidOn: sorted.length ? sorted[sorted.length - 1].paidOn : null };
}

/** Credit note for a refunded deposit (or part of it). Amounts on it are negative. */
export function creditNoteDraft(input: { original: Invoice; refundCents: number }): InvoiceDraft {
  const { original } = input;
  const text = INVOICE_TEXT[original.locale];
  const line = original.lines[0];
  return base({
    sellerType: original.sellerType,
    sellerTherapistId: original.sellerTherapistId,
    kind: "credit_note",
    locale: original.locale,
    appointmentId: original.appointmentId,
    creditedInvoiceId: original.id,
    buyerClientId: original.buyerClientId,
    seller: original.seller,
    buyer: original.buyer,
    lines: [lineFromGross(text.credit(original.number ?? ""), -input.refundCents, line.btwTreatment, line.exemptionGround)],
    notes: [text.refunded(euro(input.refundCents, original.locale))],
    dueOn: null,
  });
}

/** Rate valid on a day for a room (null = the default shared-room rate). Newest first wins. */
function rateOn(rates: RentRate[], roomId: Id | null, day: string): RentRate | null {
  return (
    rates
      .filter((r) => r.roomId === roomId && r.validFrom <= day && (r.validTo == null || r.validTo >= day))
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ?? null
  );
}

/**
 * Room-rent invoice for one therapist and month (D12): fixed monthly rent for rooms
 * assigned to them, plus each reserved block in rooms priced per block. Returns null
 * when there is nothing to bill. `localDayOf` turns a block start into its local date.
 */
export function rentInvoiceDraft(input: {
  therapist: Therapist;
  business: TherapistBusiness | null;
  email: string | null;
  rooms: Room[];
  rates: RentRate[];
  blocks: RoomBlock[];
  monthFirstDay: string;
  monthNextDay: string;
  dueOn: string;
  localDayOf: (iso: string) => string;
  /** Monthly fee of the bookkeeping add-on (excl. BTW, 21%), when it is on (D44). */
  booksAddonFeeCents?: number | null;
}): InvoiceDraft | null {
  const locale: Locale = "nl";
  const text = INVOICE_TEXT[locale];
  const { therapist, monthFirstDay } = input;
  const lines: InvoiceLine[] = [];
  const ground = (t: BtwTreatment) => (t === "exempt" ? text.rentGround : null);

  for (const room of [...input.rooms].sort((a, b) => a.number - b.number)) {
    if (room.privateTherapistId !== therapist.id || !room.active) continue;
    const rate = rateOn(input.rates, room.id, monthFirstDay);
    if (rate?.pricingMode === "fixed_monthly") {
      lines.push(lineFromNet(text.rentFixed(room.number, monthName(monthFirstDay, locale)), 1, rate.amountCents, rate.btwTreatment, ground(rate.btwTreatment)));
    }
  }

  // Per-block rent: one line per room and rate, quantity = number of blocks.
  const groups = new Map<string, { room: Room; rate: RentRate; count: number }>();
  for (const block of input.blocks) {
    if (block.therapistId !== therapist.id || block.status !== "reserved") continue;
    const day = input.localDayOf(block.period.start);
    if (day < monthFirstDay || day >= input.monthNextDay) continue;
    const room = input.rooms.find((r) => r.id === block.roomId);
    if (!room) continue;
    const own = rateOn(input.rates, room.id, day);
    if (own?.pricingMode === "fixed_monthly") continue;
    const rate = own ?? (room.kind === "shared" ? rateOn(input.rates, null, day) : null);
    if (!rate) continue;
    const key = `${room.id}:${rate.id}`;
    const g = groups.get(key) ?? { room, rate, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  for (const g of [...groups.values()].sort((a, b) => a.room.number - b.room.number)) {
    lines.push(lineFromNet(text.rentBlocks(g.room.number), g.count, g.rate.amountCents, g.rate.btwTreatment, ground(g.rate.btwTreatment)));
  }
  if (input.booksAddonFeeCents) lines.push(lineFromNet(text.booksAddon(monthName(monthFirstDay, locale)), 1, input.booksAddonFeeCents, "21", null));
  if (lines.length === 0) return null;

  return base({
    sellerType: "centre",
    sellerTherapistId: null,
    kind: "room_rent",
    locale,
    rentMonth: monthFirstDay,
    buyerTherapistId: therapist.id,
    seller: CENTRE_PARTY,
    buyer: therapistParty(input.business, therapist, input.email),
    lines,
    notes: [text.rentPay(longDate(input.dueOn, locale))],
    dueOn: input.dueOn,
  });
}
