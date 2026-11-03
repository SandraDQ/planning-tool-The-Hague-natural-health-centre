import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { Invoice, IntakeInput, Session } from "@/lib/domain/types";
import { DEMO_IDS, createSeedState } from "./seed";
import { createDemoStore } from "./store";

const T0 = Date.parse("2026-11-02T07:30:00Z"); // a Monday morning in Amsterdam
const DAY = 86_400_000;

function setup(start = T0) {
  const clock = { now: start };
  const state = createSeedState(new Date(start));
  const store = createDemoStore(state, { now: () => clock.now });
  return { clock, state, store };
}

const as = {
  admin: { role: "admin", userId: DEMO_IDS.admin, displayName: "Admin" } satisfies Session,
  therapist: (therapistId: string): Session => ({ role: "therapist", userId: `user-${therapistId}`, therapistId, displayName: therapistId }),
  client: (clientId: string): Session => ({ role: "client", userId: `user-${clientId}`, clientId, displayName: clientId }),
};
const guest = { firstName: "Test", lastName: "Gast", email: "test.gast@example.invalid", phone: "+31 6 0000 0000", locale: "nl" as const };
const intake: IntakeInput = { reason: "x", newClient: true, acceptedPolicy: true, healthDataConsent: true };
const range = (from: number, days: number) => ({ start: new Date(from).toISOString(), end: new Date(from + days * DAY).toISOString() });

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
}

/** Books and pays a session with Anna (21% BTW, €25 deposit on a €75 follow-up). */
async function bookAnna(ctx: ReturnType<typeof setup>) {
  const slots = await ctx.store.public.findSlots("st-anna-acu-follow", range(T0 + DAY, 14));
  const held = await ctx.store.booking.holdSlot({ sessionTypeId: "st-anna-acu-follow", slot: slots[0], client: guest, intake });
  const confirmed = await ctx.store.booking.confirmPayment(held.id, "tr_test");
  return confirmed;
}

const numbersOf = (xs: Invoice[]) => xs.map((i) => i.number!);

describe("seeded invoices", () => {
  it("are numbered gap-free per seller and year, in date order", () => {
    const { state } = setup();
    const sellers = new Map<string, Invoice[]>();
    for (const inv of state.invoices.filter((i) => i.status === "issued")) {
      const key = `${inv.sellerType}:${inv.sellerTherapistId}:${inv.number!.slice(0, 4)}`;
      sellers.set(key, [...(sellers.get(key) ?? []), inv]);
    }
    expect(sellers.size).toBeGreaterThan(3);
    for (const list of sellers.values()) {
      const sorted = [...list].sort((a, b) => a.number!.localeCompare(b.number!));
      sorted.forEach((inv, i) => expect(Number(inv.number!.slice(5))).toBe(i + 1));
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].issuedAt! >= sorted[i - 1].issuedAt!).toBe(true);
    }
  });

  it("count as already e-mailed, so no backlog goes out", async () => {
    const { store } = setup();
    expect(await store.invoices.listUnsent()).toEqual([]);
  });

  it("leave some past sessions still to pay", async () => {
    const { store } = setup();
    const rows = (await Promise.all(["th-anna", "th-bram", "th-carla", "th-daan", "th-eva"].map((t) => store.therapist.listOutstanding(as.therapist(t))))).flat();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.dueCents > 0 && r.dueCents === r.priceCents - r.depositPaidCents - r.balancePaidCents)).toBe(true);
  });
});

describe("client invoices", () => {
  it("deposit at payment, final invoice once the balance is paid: deposit + final = price", async () => {
    const ctx = setup();
    const appt = await bookAnna(ctx);
    const unsent = await ctx.store.invoices.listUnsent();
    expect(unsent).toHaveLength(1);
    const deposit = unsent[0];
    expect(deposit).toMatchObject({ kind: "deposit", sellerTherapistId: "th-anna", totalCents: 2500, paidCents: 2500, btwCents: 434 });
    expect(deposit.number).toMatch(/^2026-\d{4}$/);
    expect(deposit.buyer.email).toBe(guest.email);

    ctx.clock.now = Date.parse(appt.session.end);
    const me = as.therapist("th-anna");
    expect((await ctx.store.therapist.listOutstanding(me)).find((r) => r.appointment.id === appt.id)?.dueCents).toBe(5000);
    await ctx.store.therapist.recordBalancePayment(me, { appointmentId: appt.id, method: "pin", amountCents: 2000, paidOn: "2026-11-03" });
    expect((await ctx.store.therapist.listAppointmentInvoices(me, [appt.id])).map((i) => i.kind)).toEqual(["deposit"]); // not paid in full yet
    await ctx.store.therapist.recordBalancePayment(me, { appointmentId: appt.id, method: "cash", amountCents: 3000, paidOn: "2026-11-03" });
    const invoices = await ctx.store.therapist.listAppointmentInvoices(me, [appt.id]);
    const final = invoices.find((i) => i.kind === "final")!;
    expect(final.totalCents).toBe(5000);
    expect(final.paidCents).toBe(5000);
    expect(final.lines[0].lineTotalCents + final.lines[0].btwCents).toBe(7500);
    expect(final.lines[1].lineTotalCents + final.lines[1].btwCents).toBe(-2500);
    expect(final.btwCents + deposit.btwCents).toBe(final.lines[0].btwCents); // BTW over the whole session, once
    expect(Number(final.number!.slice(5))).toBe(Number(deposit.number!.slice(5)) + 1);
    expect((await ctx.store.therapist.listOutstanding(me)).some((r) => r.appointment.id === appt.id)).toBe(false);
  });

  it("the therapist can send the final invoice before being paid; payments then update it", async () => {
    const ctx = setup();
    const appt = await bookAnna(ctx);
    const me = as.therapist("th-anna");
    expect(await code(ctx.store.therapist.sendFinalInvoice(me, appt.id))).toBe("invalid"); // not started yet
    ctx.clock.now = Date.parse(appt.session.end);
    const sent = await ctx.store.therapist.sendFinalInvoice(me, appt.id);
    expect(sent).toMatchObject({ kind: "final", totalCents: 5000, paidCents: 0 });
    expect((await ctx.store.therapist.sendFinalInvoice(me, appt.id)).id).toBe(sent.id); // idempotent
    await ctx.store.therapist.recordBalancePayment(me, { appointmentId: appt.id, method: "transfer", amountCents: 5000, paidOn: "2026-11-04" });
    const [updated] = (await ctx.store.therapist.listAppointmentInvoices(me, [appt.id])).filter((i) => i.kind === "final");
    expect(updated).toMatchObject({ id: sent.id, number: sent.number, totalCents: 5000, paidCents: 5000, paidOn: "2026-11-04" });
  });

  it("a refunded deposit gets a credit note", async () => {
    const ctx = setup();
    const appt = await bookAnna(ctx);
    await ctx.store.therapist.cancelAppointment(as.therapist("th-anna"), appt.id, "therapist");
    const all = await ctx.store.therapist.listAppointmentInvoices(as.therapist("th-anna"), [appt.id]);
    const credit = all.find((i) => i.kind === "credit_note")!;
    const deposit = all.find((i) => i.kind === "deposit")!;
    expect(credit.totalCents).toBe(-2500);
    expect(credit.creditedInvoiceId).toBe(deposit.id);
    expect(deposit.paidCents).toBe(0);
  });

  it("KOR therapists invoice without BTW and print the ground", async () => {
    const ctx = setup();
    const slots = await ctx.store.public.findSlots("st-daan-60", range(T0 + DAY, 14));
    const held = await ctx.store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot: slots[0], client: guest, intake });
    await ctx.store.booking.confirmPayment(held.id, "tr_daan");
    const [inv] = await ctx.store.invoices.listUnsent();
    expect(inv.btwCents).toBe(0);
    expect(inv.lines[0]).toMatchObject({ btwTreatment: "exempt", exemptionGround: expect.stringContaining("KOR") });
  });
});

describe("who may see which invoice", () => {
  it("client, issuing therapist and (rent only) admin; anyone else gets not_found", async () => {
    const ctx = setup();
    const appt = await bookAnna(ctx);
    const [deposit] = await ctx.store.invoices.listUnsent();
    const buyer = as.client(appt.clientId);
    expect((await ctx.store.invoices.getForViewer(buyer, deposit.id)).id).toBe(deposit.id);
    expect((await ctx.store.invoices.getForViewer(as.therapist("th-anna"), deposit.id)).id).toBe(deposit.id);
    expect(await code(ctx.store.invoices.getForViewer(as.therapist("th-bram"), deposit.id))).toBe("not_found");
    expect(await code(ctx.store.invoices.getForViewer(as.client(DEMO_IDS.clientLotte), deposit.id))).toBe("not_found");
    expect(await code(ctx.store.invoices.getForViewer(as.admin, deposit.id))).toBe("not_found"); // admin never sees client invoices
    expect((await ctx.store.client.listMyInvoices(buyer)).map((i) => i.id)).toContain(deposit.id);
    expect((await ctx.store.therapist.listMyInvoices(as.therapist("th-bram"))).some((i) => i.id === deposit.id)).toBe(false);
    expect(JSON.stringify(await ctx.store.admin.listRentInvoices(as.admin))).not.toContain(deposit.id);
    expect(await code(ctx.store.admin.listRentInvoices(as.therapist("th-anna")))).toBe("forbidden");
  });
});

describe("room-rent run", () => {
  it("prepares drafts, sends them with numbers and due dates, and tracks payment", async () => {
    const ctx = setup();
    const month = "2026-11-01";
    const drafts = await ctx.store.admin.prepareRentInvoices(as.admin, month);
    expect(drafts.length).toBeGreaterThan(3);
    expect(drafts.every((d) => d.status === "draft" && d.number === null)).toBe(true);
    const anna = drafts.find((d) => d.buyerTherapistId === "th-anna")!;
    expect(anna.lines[0]).toMatchObject({ description: "Huur kamer 3, november 2026", lineTotalCents: 65000, btwTreatment: "exempt" });
    const daan = drafts.find((d) => d.buyerTherapistId === "th-daan")!;
    expect(daan.lines[0].quantity).toBeGreaterThan(0);
    expect(daan.totalCents).toBe(daan.lines.reduce((n, l) => n + l.quantity * 4000, 0));

    // Preparing again replaces the drafts, it does not add to them.
    const again = await ctx.store.admin.prepareRentInvoices(as.admin, month);
    expect((await ctx.store.admin.listRentInvoices(as.admin, month)).length).toBe(again.length);

    const sent = await ctx.store.admin.sendRentInvoices(as.admin, again.map((d) => d.id));
    expect(sent.every((i) => i.status === "issued" && i.dueOn === "2026-11-16")).toBe(true);
    const centre = numbersOf((await ctx.store.admin.listRentInvoices(as.admin)).filter((i) => i.status === "issued")).sort();
    centre.forEach((n, i) => expect(Number(n.slice(5))).toBe(i + 1)); // one gap-free sequence for the centre
    expect((await ctx.store.invoices.listUnsent()).length).toBe(sent.length);

    // Already billed therapists are not billed twice.
    expect(await ctx.store.admin.prepareRentInvoices(as.admin, month)).toEqual([]);

    const paid = await ctx.store.admin.setRentInvoicePaid(as.admin, sent[0].id, "2026-11-02");
    expect(paid).toMatchObject({ paidCents: paid.totalCents, paidOn: "2026-11-02" });
    expect(await code(ctx.store.admin.setRentInvoicePaid(as.admin, sent[0].id, "2026-12-01"))).toBe("invalid"); // future
    expect((await ctx.store.admin.setRentInvoicePaid(as.admin, sent[0].id, null)).paidCents).toBe(0);

    // The renter sees their own rent invoice, never someone else's.
    const mine = await ctx.store.therapist.listMyRentInvoices(as.therapist(sent[0].buyerTherapistId!));
    expect(mine.map((i) => i.id)).toContain(sent[0].id);
    expect(mine.every((i) => i.buyerTherapistId === sent[0].buyerTherapistId)).toBe(true);
  });

  it("the seed has last month's rent sent, with one still open", async () => {
    const { store } = setup();
    const issued = (await store.admin.listRentInvoices(as.admin, "2026-10-01")).filter((i) => i.status === "issued");
    expect(issued.length).toBeGreaterThan(0);
    expect(issued.filter((i) => i.paidCents < i.totalCents).map((i) => i.buyerTherapistId)).toEqual(["th-bram"]);
  });
});

describe("BTW settings", () => {
  it("the admin sets a therapist's BTW treatment; the exemption ground is kept only when exempt", async () => {
    const { store } = setup();
    const b = (await store.admin.getBusiness(as.admin, "th-anna"))!;
    const saved = await store.admin.setBusiness(as.admin, { ...b, btwTreatment: "9", exemptionGround: "should be dropped" });
    expect(saved).toMatchObject({ btwTreatment: "9", exemptionGround: null });
    expect(await code(store.admin.setBusiness(as.admin, { ...b, btwTreatment: "15" as never }))).toBe("invalid");
  });
});
