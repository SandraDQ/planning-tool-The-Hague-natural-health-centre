import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { IntakeInput, Session } from "@/lib/domain/types";
import { DEMO_IDS, createSeedState } from "./seed";
import { createDemoStore } from "./store";
import { validateAppointment } from "@/lib/scheduling";

const T0 = Date.parse("2026-11-02T07:30:00Z"); // a Monday morning in Amsterdam
const MIN = 60_000;
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
  client: { role: "client", userId: "user-client", clientId: DEMO_IDS.clientLotte, displayName: "Client" } satisfies Session,
};

const guest = { firstName: "Test", lastName: "Gast", email: "test.gast@example.invalid", phone: "+31 6 0000 0000", locale: "nl" as const };
const intake: IntakeInput = { reason: "SECRET-INTAKE-REASON", newClient: true, acceptedPolicy: true, healthDataConsent: true };
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

async function firstSlot(store: ReturnType<typeof setup>["store"], sessionTypeId = "st-daan-60", from = T0 + DAY) {
  const slots = await store.public.findSlots(sessionTypeId, range(from, 14));
  expect(slots.length).toBeGreaterThan(0);
  return slots[0];
}

describe("demo seed", () => {
  it("has the centre's rooms, templates and therapies, and a consistent calendar", () => {
    const { state } = setup();
    expect(state.rooms.map((r) => `${r.number}:${r.kind}`)).toEqual(["1:shared", "2:shared", "3:private", "4:private", "5:shared", "6:private"]);
    expect(state.rooms.filter((r) => r.kind === "private").every((r) => r.privateTherapistId)).toBe(true);
    expect(state.blockTemplates.map((t) => `${t.startTime}-${t.endTime}`)).toEqual(["08:00-12:00", "13:00-17:00", "18:00-22:00"]);
    expect(state.therapies).toHaveLength(13);
    expect(state.therapists.some((t) => t.paperCalendar)).toBe(true);
    for (const room of state.rooms.filter((r) => r.kind === "shared")) {
      expect(new Set(state.blockSeries.filter((s) => s.roomId === room.id).map((s) => s.therapistId)).size).toBe(3);
    }
    expect(state.appointments.some((a) => a.status === "confirmed")).toBe(true);
    expect(state.appointments.some((a) => a.status === "held")).toBe(true);
    expect(state.appointments.some((a) => a.status === "cancelled")).toBe(true);
    expect(state.therapists.every((t) => t.displayName.startsWith("Demo – "))).toBe(true);
    // Every seeded live appointment obeys the database rules.
    for (const a of state.appointments.filter((x) => x.status === "held" || x.status === "confirmed")) {
      const result = validateAppointment({
        appointment: { id: a.id, therapistId: a.therapistId, roomId: a.roomId, session: a.session, bufferMinutes: a.snapshot.bufferMinutes },
        rooms: state.rooms,
        roomBlocks: state.blocks,
        appointments: state.appointments,
        now: T0,
      });
      expect(result, a.id).toBeNull();
    }
  });

  it("offers online slots for every bookable therapist", async () => {
    const { state, store } = setup();
    for (const t of state.therapists.filter((x) => x.bookable)) {
      const service = state.services.find((s) => s.therapistId === t.id)!;
      const st = state.sessionTypes.find((x) => x.serviceId === service.id)!;
      const slots = await store.public.findSlots(st.id, range(T0, 28));
      expect(slots.length, t.displayName).toBeGreaterThan(0);
    }
  });
});

describe("booking: hold and confirm", () => {
  it("hold → confirm → confirming again with the same payment is idempotent", async () => {
    const { store } = setup();
    const slot = await firstSlot(store);
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    expect(held.status).toBe("held");
    expect(Date.parse(held.holdExpiresAt!)).toBe(T0 + 15 * MIN);
    expect(held.snapshot.durationMin).toBe(60);
    expect(held.snapshot.depositCents).toBe(1500);

    const confirmed = await store.booking.confirmPayment(held.id, "tr_demo_1");
    expect(confirmed.status).toBe("confirmed");
    const again = await store.booking.confirmPayment(held.id, "tr_demo_1");
    expect(again).toEqual(confirmed);
    expect(await code(store.booking.confirmPayment(held.id, "tr_demo_other"))).toBe("invalid");
  });

  it("a taken slot cannot be held twice and disappears from findSlots", async () => {
    const { store } = setup();
    const slot = await firstSlot(store);
    await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    expect(await code(store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: { ...guest, email: "b@example.invalid" }, intake }))).toBe("slot_taken");
    const after = await store.public.findSlots("st-daan-60", range(T0, 14));
    expect(after.some((s) => s.session.start === slot.session.start)).toBe(false);
  });

  it("an expired hold frees the slot and can no longer be confirmed", async () => {
    const { clock, store } = setup();
    const slot = await firstSlot(store);
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    clock.now += 15 * MIN;
    const after = await store.public.findSlots("st-daan-60", range(T0, 14));
    expect(after.some((s) => s.session.start === slot.session.start)).toBe(true);
    expect((await store.booking.getAppointment(held.id))?.status).toBe("cancelled");
    expect(await code(store.booking.confirmPayment(held.id, "tr_late"))).toBe("hold_expired");
    const second = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    expect(second.status).toBe("held");
  });

  it("a failed payment frees the slot and purges the intake (D18)", async () => {
    const { state, store } = setup();
    const slot = await firstSlot(store);
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    expect(state.intakes.some((i) => i.appointmentId === held.id)).toBe(true);
    await store.booking.failPayment(held.id);
    expect((await store.booking.getAppointment(held.id))?.status).toBe("cancelled");
    expect(state.intakes.some((i) => i.appointmentId === held.id)).toBe(false);
  });

  it("refuses a start that is not an offered slot (outside the block, off the grid)", async () => {
    const { store } = setup();
    const daan = as.therapist(DEMO_IDS.therapists.daan);
    // An empty Sunday-morning block (08:00–12:00 local = 07:00–11:00Z in November).
    const [block] = await store.therapist.reserveBlock(daan, { roomId: DEMO_IDS.rooms[1], blockTemplateId: DEMO_IDS.templates.morning, date: "2026-11-08" });
    const at = (iso: string) => ({ therapistId: DEMO_IDS.therapists.daan, roomId: DEMO_IDS.rooms[1], roomBlockId: block.id, session: { start: iso, end: iso } });
    const hold = (iso: string) => store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot: at(iso), client: guest, intake });
    expect(await code(hold("2026-11-08T06:30:00.000Z"))).toBe("outside_block"); // starts before the block
    expect(await code(hold("2026-11-08T10:30:00.000Z"))).toBe("outside_block"); // runs past the block end
    expect(await code(hold("2026-11-08T07:05:00.000Z"))).toBe("outside_block"); // not on the 15-minute grid
    expect(await code(hold("2026-11-08T07:15:00.000Z"))).toBe("ok");
  });

  it("refuses a booking without consent", async () => {
    const { store } = setup();
    const slot = await firstSlot(store);
    const bad = { ...intake, healthDataConsent: false } as unknown as IntakeInput;
    expect(await code(store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake: bad }))).toBe("invalid");
  });
});

describe("authorisation", () => {
  it("therapist A cannot read or change therapist B's appointments", async () => {
    const { state, store } = setup();
    const A = DEMO_IDS.therapists.anna;
    const B = DEMO_IDS.therapists.bram;
    const mine = await store.therapist.listMyAppointments(as.therapist(A), range(T0 - 14 * DAY, 40));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.therapistId === A)).toBe(true);
    const bAppt = state.appointments.find((a) => a.therapistId === B && a.status === "confirmed" && a.source === "online")!;
    expect(await code(store.therapist.readIntake(as.therapist(A), bAppt.id))).toBe("forbidden");
    expect(await code(store.therapist.cancelAppointment(as.therapist(A), bAppt.id, "therapist"))).toBe("forbidden");
    expect(await store.therapist.listClients(as.therapist(A), [bAppt.clientId])).toEqual(
      mine.some((a) => a.clientId === bAppt.clientId) ? expect.any(Array) : [],
    );
    // The treating therapist can read it.
    expect(await code(store.therapist.readIntake(as.therapist(B), bAppt.id))).toBe("ok");
  });

  it("each role only reaches its own part of the store", async () => {
    const { store } = setup();
    expect(await code(store.admin.listRooms(as.therapist(DEMO_IDS.therapists.anna)))).toBe("forbidden");
    expect(await code(store.admin.listRooms(as.client))).toBe("forbidden");
    expect(await code(store.therapist.getMe(as.admin))).toBe("forbidden");
    expect(await code(store.therapist.readIntake(as.admin, "x"))).toBe("forbidden");
    expect(await code(store.client.listMyAppointments(as.admin))).toBe("forbidden");
    expect(await code(store.therapist.getMe({ role: "therapist", userId: "u", therapistId: "nobody", displayName: "x" }))).toBe("forbidden");
  });

  it("listTakenBlocks hides who holds other therapists' blocks", async () => {
    const { store } = setup();
    const taken = await store.therapist.listTakenBlocks(as.therapist(DEMO_IDS.therapists.daan), range(T0, 14));
    expect(taken.some((b) => b.mine)).toBe(true);
    expect(taken.some((b) => !b.mine)).toBe(true);
    expect(taken.every((b) => !("therapistId" in b))).toBe(true);
    const rooms = await store.therapist.listRooms(as.therapist(DEMO_IDS.therapists.daan));
    expect(rooms.every((r) => r.privateTherapistId === null)).toBe(true);
  });
});

describe("admin never sees intake", () => {
  it("roomGrid contains appointments but no intake data", async () => {
    const { store } = setup();
    const slot = await firstSlot(store);
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    await store.booking.confirmPayment(held.id, "tr_x");
    const grid = await store.admin.roomGrid(as.admin, range(T0 - 7 * DAY, 28));
    expect(grid.rooms).toHaveLength(6);
    expect(grid.blocks.length).toBeGreaterThan(0);
    expect(grid.appointments.some((a) => a.id === held.id)).toBe(true);
    const json = JSON.stringify(grid);
    expect(json).not.toContain("SECRET-INTAKE-REASON");
    expect(json).not.toMatch(/"(answers|reason|healthDataConsent|acceptedPolicy|dateOfBirth|comments)"/);
  });
});

describe("room layer", () => {
  it("a block with bookings cannot be released, by therapist or admin (D14)", async () => {
    const { store } = setup();
    const slot = await firstSlot(store);
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    await store.booking.confirmPayment(held.id, "tr_y");
    const daan = as.therapist(DEMO_IDS.therapists.daan);
    expect(await code(store.therapist.releaseBlock(daan, slot.roomBlockId!))).toBe("block_has_appointments");
    expect(await code(store.admin.releaseBlock(as.admin, slot.roomBlockId!))).toBe("block_has_appointments");
    expect(await code(store.therapist.releaseBlock(as.therapist(DEMO_IDS.therapists.eva), slot.roomBlockId!))).toBe("forbidden");
  });

  it("an empty block can be released; an expired hold does not keep it", async () => {
    const { clock, store } = setup();
    const daan = as.therapist(DEMO_IDS.therapists.daan);
    const slots = await store.public.findSlots("st-daan-60", range(T0 + 7 * DAY, 21));
    const slot = slots[slots.length - 1];
    const blockAppts = (await store.therapist.listMyAppointments(daan, range(T0, 40))).filter((a) => a.roomBlockId === slot.roomBlockId);
    for (const a of blockAppts.filter((x) => x.status === "confirmed" || x.status === "held")) await store.therapist.cancelAppointment(daan, a.id, "therapist");
    await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    expect(await code(store.therapist.releaseBlock(daan, slot.roomBlockId!))).toBe("block_has_appointments");
    clock.now += 16 * MIN;
    expect(await code(store.therapist.releaseBlock(daan, slot.roomBlockId!))).toBe("ok");
    expect((await store.therapist.listMyBlocks(daan, range(T0, 40))).some((b) => b.id === slot.roomBlockId)).toBe(false);
  });

  it("two therapists cannot reserve the same block", async () => {
    const { state, store } = setup();
    const room = state.rooms.find((r) => r.number === 1)!;
    const date = "2026-11-08"; // a Sunday: free in the seed
    const first = await store.therapist.reserveBlock(as.therapist(DEMO_IDS.therapists.eva), { roomId: room.id, blockTemplateId: DEMO_IDS.templates.morning, date });
    expect(first).toHaveLength(1);
    expect(
      await code(store.therapist.reserveBlock(as.therapist(DEMO_IDS.therapists.daan), { roomId: room.id, blockTemplateId: DEMO_IDS.templates.morning, date })),
    ).toBe("block_taken");
    const weekly = await store.admin.assignBlock(as.admin, {
      roomId: room.id,
      therapistId: DEMO_IDS.therapists.daan,
      blockTemplateId: DEMO_IDS.templates.afternoon,
      date,
      weekly: true,
    });
    expect(weekly.length).toBeGreaterThan(4);
  });
});
