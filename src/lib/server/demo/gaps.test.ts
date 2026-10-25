// Store gaps found by the dashboards (handoffs/mvp-dashboards.md, "Gaps and questions").
import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { Session } from "@/lib/domain/types";
import { DEMO_IDS, createSeedState } from "./seed";
import { createDemoStore } from "./store";

const T0 = Date.parse("2026-11-02T07:30:00Z"); // Monday
const DAY = 86_400_000;
const range = (from: number, days: number) => ({ start: new Date(from).toISOString(), end: new Date(from + days * DAY).toISOString() });
const admin: Session = { role: "admin", userId: DEMO_IDS.admin, displayName: "Admin" };
const therapist = (id: string): Session => ({ role: "therapist", userId: `u-${id}`, therapistId: id, displayName: id });
const { anna, bram, daan, femke } = DEMO_IDS.therapists;

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

describe("admin room grid", () => {
  it("shows the client's first name only, never other client details or intake", async () => {
    const { state, store } = setup();
    const grid = await store.admin.roomGrid(admin, range(T0, 7));
    expect(grid.appointments.length).toBeGreaterThan(0);
    for (const a of grid.appointments) {
      expect(a.clientFirstName).toBe(state.clients.find((c) => c.id === a.clientId)!.firstName);
    }
    const json = JSON.stringify(grid);
    for (const c of state.clients) {
      expect(json).not.toContain(c.email);
      expect(json).not.toContain(c.phone);
      expect(json).not.toContain(`"${c.lastName}"`);
    }
    expect(json).not.toMatch(/"(answers|reason|healthDataConsent)"/);
  });
});

describe("balance payments", () => {
  it("can only be recorded once the session has started, and are listed for own appointments only", async () => {
    const { clock, state, store } = setup();
    const future = state.appointments.find((a) => a.therapistId === anna && a.status === "confirmed" && Date.parse(a.session.start) > T0)!;
    const input = { appointmentId: future.id, method: "pin" as const, amountCents: 5000, paidOn: "2026-11-05" };
    expect(await code(store.therapist.recordBalancePayment(therapist(anna), input))).toBe("invalid");
    clock.now = Date.parse(future.session.start);
    const paid = await store.therapist.recordBalancePayment(therapist(anna), input);
    expect(await store.therapist.listBalancePayments(therapist(anna), [future.id])).toEqual([paid]);
    expect(await store.therapist.listBalancePayments(therapist(bram), [future.id])).toEqual([]);
    expect(await code(store.therapist.recordBalancePayment(therapist(bram), input))).toBe("forbidden");
  });
});

describe("manual bookings", () => {
  it("need only a first name (phone/paper clients)", async () => {
    const { state, store } = setup();
    const daanSlots = await store.public.findSlots("st-daan-30", range(T0 + DAY, 14));
    const slot = daanSlots[0];
    const appt = await store.therapist.addManualBooking(therapist(daan), {
      sessionTypeId: "st-daan-30",
      slot,
      client: { firstName: "Mevrouw", locale: "nl" },
    });
    expect(appt.source).toBe("manual");
    expect(appt.snapshot.depositCents).toBe(0);
    expect(state.clients.find((c) => c.id === appt.clientId)).toMatchObject({ firstName: "Mevrouw", lastName: "", email: "", phone: "" });
    const other = daanSlots.find((s) => Date.parse(s.session.start) >= Date.parse(appt.occupied.end))!;
    expect(await code(store.therapist.addManualBooking(therapist(daan), { sessionTypeId: "st-daan-30", slot: other, client: { firstName: " ", locale: "nl" } }))).toBe("invalid");
    expect(
      await code(store.therapist.addManualBooking(therapist(daan), { sessionTypeId: "st-daan-30", slot: other, client: { firstName: "A", email: "not-an-email", locale: "nl" } })),
    ).toBe("invalid");
  });
});

describe("admin block assignment", () => {
  it("is refused on a past date (or a block that has started)", async () => {
    const { store } = setup();
    const input = { roomId: DEMO_IDS.rooms[1], therapistId: daan, blockTemplateId: DEMO_IDS.templates.morning };
    expect(await code(store.admin.assignBlock(admin, { ...input, date: "2026-11-01" }))).toBe("invalid"); // yesterday (Sunday)
    expect(await code(store.admin.assignBlock(admin, { ...input, date: "2026-11-08" }))).toBe("ok");
  });
});

describe("time off", () => {
  it("can be deleted by its own therapist only", async () => {
    const { store } = setup();
    const row = await store.therapist.addTimeOff(therapist(anna), range(T0 + 5 * DAY, 1), "test");
    expect(await code(store.therapist.deleteTimeOff(therapist(bram), row.id))).toBe("forbidden");
    await store.therapist.deleteTimeOff(therapist(anna), row.id);
    expect((await store.therapist.listMyTimeOff(therapist(anna))).some((t) => t.id === row.id)).toBe(false);
    expect(await code(store.therapist.deleteTimeOff(therapist(anna), row.id))).toBe("not_found");
  });
});

describe("paper-calendar windows (admin)", () => {
  it("can be listed, opened and closed; a closed window offers no slots", async () => {
    const { store } = setup();
    const all = await store.admin.listPaperWindows(admin, { therapistId: femke });
    expect(all.map((w) => w.status)).toEqual(["filled", "open", "open", "open"]);
    expect(await code(store.admin.closePaperWindow(admin, all[0].id))).toBe("invalid"); // already booked
    const before = await store.public.findSlots("st-femke-follow", range(T0, 35));
    expect(before.some((s) => s.paperWindowId === all[1].id)).toBe(true);
    const closed = await store.admin.closePaperWindow(admin, all[1].id);
    expect(closed.status).toBe("closed");
    const after = await store.public.findSlots("st-femke-follow", range(T0, 35));
    expect(after.some((s) => s.paperWindowId === all[1].id)).toBe(false);
    // The same time can be opened again as a new window.
    const reopened = await store.admin.openPaperWindow(admin, { therapistId: femke, roomId: closed.roomId, period: closed.period });
    expect(reopened.status).toBe("open");
    expect(await code(store.admin.listPaperWindows(therapist(femke)))).toBe("forbidden");
  });
});
