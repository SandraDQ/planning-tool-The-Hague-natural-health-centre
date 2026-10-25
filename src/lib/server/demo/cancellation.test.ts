import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { CancellationPolicy, IntakeInput, Session } from "@/lib/domain/types";
import { cancellationTerms, freeCancellationDeadline } from "./cancellation";
import { DEMO_IDS, createSeedState } from "./seed";
import { createDemoStore } from "./store";

const T0 = Date.parse("2026-11-02T07:30:00Z"); // Monday
const DAY = 86_400_000;
const HOUR = 3_600_000;
const intake: IntakeInput = { reason: "test", newClient: false, acceptedPolicy: true, healthDataConsent: true };
const lotte = { firstName: "Lotte", lastName: "Willems", email: "lotte.willems@example.invalid", phone: "+31 6 0000 0010", locale: "nl" as const };
const lotteSession: Session = { role: "client", userId: "user-client-lotte", clientId: DEMO_IDS.clientLotte, displayName: "Lotte" };
const range = (from: number, days: number) => ({ start: new Date(from).toISOString(), end: new Date(from + days * DAY).toISOString() });

function setup() {
  const clock = { now: T0 };
  const state = createSeedState(new Date(T0));
  return { clock, state, store: createDemoStore(state, { now: () => clock.now }) };
}

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
}

async function bookPaid(store: ReturnType<typeof setup>["store"], sessionTypeId: string, client = lotte) {
  const [slot] = await store.public.findSlots(sessionTypeId, range(T0 + 3 * DAY, 14));
  const held = await store.booking.holdSlot({ sessionTypeId, slot, client, intake });
  await store.booking.confirmPayment(held.id, `tr_${held.id}`);
  return { slot, appt: held };
}

const policy = (p: Partial<CancellationPolicy>): CancellationPolicy => ({
  therapistId: "t",
  noticeValue: 24,
  noticeUnit: "hours",
  feeType: "percent",
  feeValue: 50,
  exemptNewClients: false,
  text: { nl: "", en: "" },
  ...p,
});

describe("cancellation policy terms", () => {
  it("computes the free-cancellation deadline in hours and business days", () => {
    expect(freeCancellationDeadline(policy({ noticeValue: 24 }), "2026-11-10T09:00:00.000Z")).toBe("2026-11-09T09:00:00.000Z");
    // Monday 10:00 local, 2 business days → the Thursday before, 10:00 local.
    expect(freeCancellationDeadline(policy({ noticeValue: 2, noticeUnit: "business_days" }), "2026-11-09T09:00:00.000Z")).toBe("2026-11-05T09:00:00.000Z");
  });

  it("keeps the fee from the deposit and refunds the rest", () => {
    const base = { sessionStart: "2026-11-10T09:00:00.000Z", priceCents: 8000, depositPaidCents: 3000, newClient: false };
    const late = Date.parse("2026-11-10T08:00:00Z");
    expect(cancellationTerms({ ...base, policy: policy({ feeType: "percent", feeValue: 25 }), nowMs: late })).toMatchObject({ onTime: false, feeCents: 2000, refundCents: 1000 });
    expect(cancellationTerms({ ...base, policy: policy({ feeType: "fixed", feeValue: 5000 }), nowMs: late })).toMatchObject({ feeCents: 3000, refundCents: 0 });
    expect(cancellationTerms({ ...base, policy: policy({}), nowMs: Date.parse("2026-11-08T08:00:00Z") })).toMatchObject({ onTime: true, feeCents: 0, refundCents: 3000 });
    expect(cancellationTerms({ ...base, newClient: true, policy: policy({ exemptNewClients: true }), nowMs: late })).toMatchObject({ onTime: true, refundCents: 3000 });
    expect(cancellationTerms({ ...base, policy: null, nowMs: late })).toMatchObject({ onTime: true, refundCents: 3000 });
  });
});

describe("client.cancelAppointment", () => {
  it("on time: full deposit back, slot free again, intake purged", async () => {
    const { state, store } = setup();
    const { slot, appt } = await bookPaid(store, "st-anna-acu-follow");
    expect(appt.clientId).toBe(DEMO_IDS.clientLotte);
    const r = await store.client.cancelAppointment(lotteSession, appt.id, "client");
    expect(r).toMatchObject({ onTime: true, depositPaidCents: 2500, feeCents: 0, refundCents: 2500 });
    expect(r.appointment.status).toBe("cancelled");
    expect(state.intakes.some((i) => i.appointmentId === appt.id)).toBe(false);
    expect(state.refunds).toEqual([expect.objectContaining({ appointmentId: appt.id, amountCents: 2500 })]);
    const again = await store.public.findSlots("st-anna-acu-follow", range(T0 + 3 * DAY, 14));
    expect(again.some((s) => s.session.start === slot.session.start)).toBe(true);
  });

  it("late: the fee is kept from the deposit (Anna: 100% fee, deposit € 25)", async () => {
    const { clock, store } = setup();
    const { appt } = await bookPaid(store, "st-anna-acu-follow");
    clock.now = Date.parse(appt.session.start) - 2 * HOUR;
    const r = await store.client.cancelAppointment(lotteSession, appt.id, "client");
    expect(r).toMatchObject({ onTime: false, feeCents: 2500, refundCents: 0 });
  });

  it("late but a new client of a therapist with 'no fee for new clients': full refund", async () => {
    const { clock, store } = setup();
    const guest = { ...lotte, firstName: "Nieuw", email: "nieuw@example.invalid" };
    const { appt } = await bookPaid(store, "st-bram-60", guest);
    clock.now = Date.parse(appt.session.start) - HOUR;
    const session: Session = { role: "client", userId: "u-new", clientId: appt.clientId, displayName: "Nieuw" };
    expect(await store.client.cancelAppointment(session, appt.id, "client")).toMatchObject({ onTime: true, feeCents: 0, refundCents: 2000 });
  });

  it("uses the policy frozen at booking (D6)", async () => {
    const { clock, store } = setup();
    const { appt } = await bookPaid(store, "st-anna-acu-follow");
    const anna: Session = { role: "therapist", userId: "u-anna", therapistId: DEMO_IDS.therapists.anna, displayName: "Anna" };
    await store.therapist.setMyPolicy(anna, { noticeValue: 0, noticeUnit: "hours", feeType: "fixed", feeValue: 0, exemptNewClients: false, text: { nl: "", en: "" } });
    clock.now = Date.parse(appt.session.start) - HOUR;
    expect(await store.client.cancelAppointment(lotteSession, appt.id, "client")).toMatchObject({ onTime: false, feeCents: 2500 });
  });

  it("only the own appointment, only before it starts", async () => {
    const { clock, state, store } = setup();
    const { appt } = await bookPaid(store, "st-anna-acu-follow");
    const other = state.clients.find((c) => c.id !== DEMO_IDS.clientLotte)!;
    expect(await code(store.client.cancelAppointment({ ...lotteSession, clientId: other.id }, appt.id, "client"))).toBe("forbidden");
    expect(await code(store.client.cancelAppointment({ ...lotteSession, role: "therapist" }, appt.id, "client"))).toBe("forbidden");
    clock.now = Date.parse(appt.session.start);
    expect(await code(store.client.cancelAppointment(lotteSession, appt.id, "client"))).toBe("invalid");
  });

  it("an abandoned demo payment (failPayment) frees the slot immediately", async () => {
    const { store } = setup();
    const [slot] = await store.public.findSlots("st-daan-60", range(T0 + DAY, 14));
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: lotte, intake });
    expect((await store.public.findSlots("st-daan-60", range(T0 + DAY, 14))).some((s) => s.session.start === slot.session.start)).toBe(false);
    await store.booking.failPayment(held.id);
    expect((await store.public.findSlots("st-daan-60", range(T0 + DAY, 14))).some((s) => s.session.start === slot.session.start)).toBe(true);
  });
});
