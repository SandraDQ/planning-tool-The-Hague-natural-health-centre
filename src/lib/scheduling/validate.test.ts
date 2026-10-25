import { describe, expect, it } from "vitest";
import { canConfirmHold, findContainingBlock, holdExpiresAt, isActiveAppointment, isHoldExpired, occupiedFor, validateAppointment } from "./index";
import { appointment, at, block, paperWindow, privateRoom, rooms, sharedRoom } from "./test-fixtures";

const MON = "2026-11-02";
const now = at(MON, "07:00");

const candidate = (start: string, durationMin = 60, bufferMinutes = 0, overrides = {}) => ({
  therapistId: "t-shared",
  roomId: sharedRoom.id,
  session: { start: at(MON, start), end: new Date(Date.parse(at(MON, start)) + durationMin * 60_000).toISOString() },
  bufferMinutes,
  ...overrides,
});

describe("occupiedFor", () => {
  it("is the session plus the buffer", () => {
    expect(occupiedFor({ start: at(MON, "09:00"), end: at(MON, "10:00") }, 15)).toEqual({ start: at(MON, "09:00"), end: at(MON, "10:15") });
  });
});

describe("validateAppointment (mirrors the DB rules)", () => {
  const ctx = { rooms, roomBlocks: [block(MON)], appointments: [], now };

  it("accepts a session (incl. buffer) inside the therapist's reserved block", () => {
    expect(validateAppointment({ ...ctx, appointment: candidate("09:00", 60, 15) })).toBeNull();
    expect(validateAppointment({ ...ctx, appointment: candidate("10:45", 60, 15) })).toBeNull();
  });

  it("outside_block when the session or its buffer runs past the block end", () => {
    expect(validateAppointment({ ...ctx, appointment: candidate("11:30", 60, 0) })).toBe("outside_block");
    expect(validateAppointment({ ...ctx, appointment: candidate("11:00", 60, 15) })).toBe("outside_block");
  });

  it("outside_block without a reserved block of the same therapist and room", () => {
    expect(validateAppointment({ ...ctx, roomBlocks: [], appointment: candidate("09:00") })).toBe("outside_block");
    expect(validateAppointment({ ...ctx, roomBlocks: [block(MON, "08:00", "12:00", { therapistId: "other" })], appointment: candidate("09:00") })).toBe("outside_block");
    expect(validateAppointment({ ...ctx, roomBlocks: [block(MON, "08:00", "12:00", { status: "released" })], appointment: candidate("09:00") })).toBe("outside_block");
    expect(validateAppointment({ ...ctx, roomBlocks: [block(MON, "08:00", "12:00", { roomId: "room-2" })], appointment: candidate("09:00") })).toBe("outside_block");
  });

  it("finds the containing block id for the store", () => {
    expect(findContainingBlock(ctx.roomBlocks, candidate("09:00"))?.id).toBe(`blk-${MON}-08:00`);
  });

  it("private room: only its assigned therapist, no block needed", () => {
    const priv = { therapistId: "t-private", roomId: privateRoom.id };
    expect(validateAppointment({ ...ctx, roomBlocks: [], appointment: candidate("09:00", 60, 0, priv) })).toBeNull();
    expect(validateAppointment({ ...ctx, roomBlocks: [], appointment: candidate("09:00", 60, 0, { roomId: privateRoom.id }) })).toBe("forbidden");
  });

  it("slot_taken on overlap with the therapist's or the room's held/confirmed appointments", () => {
    const existing = appointment(MON, "09:00", 60, 15);
    expect(validateAppointment({ ...ctx, appointments: [existing], appointment: candidate("09:30") })).toBe("slot_taken");
    // New session ends exactly when the existing one starts: allowed (half-open ranges).
    expect(validateAppointment({ ...ctx, appointments: [existing], appointment: candidate("08:00") })).toBeNull();
    // Existing buffer runs until 10:15.
    expect(validateAppointment({ ...ctx, appointments: [existing], appointment: candidate("10:00") })).toBe("slot_taken");
    expect(validateAppointment({ ...ctx, appointments: [existing], appointment: candidate("10:15") })).toBeNull();
    // Our own buffer overlapping the next appointment is also a clash.
    expect(validateAppointment({ ...ctx, appointments: [existing], appointment: candidate("08:00", 45, 30) })).toBe("slot_taken");
    // Same therapist in another (private) room at the same time.
    const elsewhere = appointment(MON, "09:00", 60, 0, { roomId: "room-x" });
    expect(validateAppointment({ ...ctx, appointments: [elsewhere], appointment: candidate("09:00") })).toBe("slot_taken");
    // Another therapist in the same room.
    const roomMate = appointment(MON, "09:00", 60, 0, { therapistId: "other" });
    expect(validateAppointment({ ...ctx, appointments: [roomMate], appointment: candidate("09:00") })).toBe("slot_taken");
  });

  it("overlapping holds: a live hold takes the slot, an expired one does not", () => {
    const live = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "07:10") });
    const expired = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "06:55") });
    expect(validateAppointment({ ...ctx, appointments: [live], appointment: candidate("09:00") })).toBe("slot_taken");
    expect(validateAppointment({ ...ctx, appointments: [live], appointment: candidate("09:45") })).toBe("slot_taken");
    expect(validateAppointment({ ...ctx, appointments: [expired], appointment: candidate("09:00") })).toBeNull();
  });

  it("two clients for the same slot: first wins, second gets slot_taken", () => {
    const first = candidate("09:00");
    expect(validateAppointment({ ...ctx, appointment: first })).toBeNull();
    const stored = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: holdExpiresAt(now) });
    expect(validateAppointment({ ...ctx, appointments: [stored], appointment: candidate("09:00") })).toBe("slot_taken");
  });

  it("ignores cancelled / no-show / completed, and the appointment being moved", () => {
    const cancelled = appointment(MON, "09:00", 60, 0, { status: "cancelled" });
    const noShow = appointment(MON, "09:00", 60, 0, { status: "no_show" });
    expect(validateAppointment({ ...ctx, appointments: [cancelled, noShow], appointment: candidate("09:00") })).toBeNull();
    const self = appointment(MON, "09:00", 60, 0);
    expect(validateAppointment({ ...ctx, appointments: [self], appointment: { ...candidate("09:15"), id: self.id } })).toBeNull();
  });

  it("optional busy (time off / external) makes a slot taken", () => {
    expect(validateAppointment({ ...ctx, busy: [{ start: at(MON, "09:30"), end: at(MON, "09:45") }], appointment: candidate("09:00") })).toBe("slot_taken");
  });

  it("invalid input and unknown or inactive rooms", () => {
    expect(validateAppointment({ ...ctx, appointment: { ...candidate("09:00"), session: { start: at(MON, "10:00"), end: at(MON, "09:00") } } })).toBe("invalid");
    expect(validateAppointment({ ...ctx, appointment: candidate("09:00", 60, -5) })).toBe("invalid");
    expect(validateAppointment({ ...ctx, appointment: candidate("09:00", 60, 0, { roomId: "nope" }) })).toBe("not_found");
    expect(validateAppointment({ ...ctx, rooms: [{ ...sharedRoom, active: false }], appointment: candidate("09:00") })).toBe("invalid");
  });

  it("paper window: must be open, unbooked, same therapist and room, and contain the session", () => {
    const pctx = { ...ctx, rooms: [{ ...privateRoom, privateTherapistId: "t-paper" }], roomBlocks: [] };
    const pw = paperWindow(MON, "14:00", "15:00");
    const c = (start: string, extra = {}) => candidate(start, 60, 15, { therapistId: "t-paper", roomId: privateRoom.id, ...extra });
    expect(validateAppointment({ ...pctx, paperWindow: pw, appointment: c("14:00") })).toBeNull();
    expect(validateAppointment({ ...pctx, paperWindow: pw, appointment: c("14:15") })).toBe("invalid");
    expect(validateAppointment({ ...pctx, paperWindow: { ...pw, status: "filled" }, appointment: c("14:00") })).toBe("slot_taken");
    const booked = appointment(MON, "14:00", 30, 0, { therapistId: "t-paper", roomId: privateRoom.id });
    expect(validateAppointment({ ...pctx, paperWindow: { ...pw, period: { start: at(MON, "13:00"), end: at(MON, "16:00") } }, appointments: [booked], appointment: c("15:00") })).toBe("slot_taken");
    expect(validateAppointment({ ...pctx, paperWindow: { ...pw, therapistId: "x" }, appointment: c("14:00") })).toBe("invalid");
  });
});

describe("holds", () => {
  it("expire 15 minutes after creation", () => {
    expect(holdExpiresAt(at(MON, "07:00"))).toBe(at(MON, "07:15"));
    const held = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "07:15") });
    expect(isHoldExpired(held, at(MON, "07:14"))).toBe(false);
    expect(isHoldExpired(held, at(MON, "07:15"))).toBe(true);
    expect(isHoldExpired(held, new Date(at(MON, "08:00")))).toBe(true);
    expect(isHoldExpired({ ...held, status: "confirmed" }, at(MON, "08:00"))).toBe(false);
  });

  it("active = confirmed or live hold", () => {
    const held = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "07:15") });
    expect(isActiveAppointment(held, at(MON, "07:00"))).toBe(true);
    expect(isActiveAppointment(held, at(MON, "07:30"))).toBe(false);
    expect(isActiveAppointment({ ...held, status: "confirmed" }, at(MON, "07:30"))).toBe(true);
    expect(isActiveAppointment({ ...held, status: "cancelled" }, at(MON, "07:00"))).toBe(false);
  });

  it("canConfirmHold: idempotent for confirmed, hold_expired after expiry", () => {
    const held = appointment(MON, "09:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "07:15") });
    expect(canConfirmHold(held, at(MON, "07:10"))).toBeNull();
    expect(canConfirmHold(held, at(MON, "07:20"))).toBe("hold_expired");
    expect(canConfirmHold({ ...held, status: "confirmed" }, at(MON, "07:20"))).toBeNull();
    expect(canConfirmHold({ ...held, status: "cancelled" }, at(MON, "07:10"))).toBe("hold_expired");
  });
});
