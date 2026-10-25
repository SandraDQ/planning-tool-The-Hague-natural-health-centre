import { describe, expect, it } from "vitest";
import { blockPeriod, canReleaseBlock, canReserveBlock, expandBlockSeries } from "./index";
import { appointment, at, block, privateRoom, sharedRoom, templates } from "./test-fixtures";
import type { BlockSeries } from "@/lib/domain/types";

const MON = "2026-11-02";
const now = at("2026-10-25", "12:00");

describe("blockPeriod", () => {
  it("turns a template on a local date into a UTC period", () => {
    expect(blockPeriod(MON, templates[0])).toEqual({ start: at(MON, "08:00"), end: at(MON, "12:00") });
  });
});

describe("expandBlockSeries", () => {
  const series: BlockSeries = { id: "s-mon", roomId: sharedRoom.id, therapistId: "t-shared", weekday: 1, blockTemplateId: "bt-pm", startsOn: "2026-11-02", endsOn: "2026-11-23" };
  const range = { start: at("2026-10-01", "00:00"), end: at("2027-01-01", "00:00") };

  it("creates one reserved block per matching weekday between startsOn and endsOn (inclusive)", () => {
    const blocks = expandBlockSeries(series, templates, range);
    expect(blocks.map((b) => b.period.start)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map((d) => at(d, "13:00")));
    expect(blocks[0]).toEqual({
      id: "s-mon:2026-11-02",
      roomId: sharedRoom.id,
      therapistId: "t-shared",
      period: { start: at(MON, "13:00"), end: at(MON, "17:00") },
      seriesId: "s-mon",
      status: "reserved",
    });
  });

  it("is clipped to the range and handles an open-ended series", () => {
    const blocks = expandBlockSeries({ ...series, endsOn: null }, templates, { start: at("2026-11-10", "00:00"), end: at("2026-11-24", "00:00") });
    expect(blocks.map((b) => b.id)).toEqual(["s-mon:2026-11-16", "s-mon:2026-11-23"]);
  });

  it("starts on the first matching weekday on or after startsOn", () => {
    const blocks = expandBlockSeries({ ...series, startsOn: "2026-11-04" }, templates, range);
    expect(blocks[0].id).toBe("s-mon:2026-11-09");
  });

  it("skips dates that already have a row for this series (exceptions edit single rows, D3)", () => {
    const existing = [{ ...block("2026-11-09", "13:00", "17:00"), seriesId: "s-mon", status: "released" as const }];
    const blocks = expandBlockSeries(series, templates, range, { existing });
    expect(blocks.map((b) => b.id)).toEqual(["s-mon:2026-11-02", "s-mon:2026-11-16", "s-mon:2026-11-23"]);
  });

  it("an unknown or inactive template yields nothing", () => {
    expect(expandBlockSeries({ ...series, blockTemplateId: "nope" }, templates, range)).toEqual([]);
    expect(expandBlockSeries(series, templates.map((t) => ({ ...t, active: false })), range)).toEqual([]);
  });
});

describe("canReserveBlock", () => {
  const input = (overrides = {}) => ({
    block: { roomId: sharedRoom.id, therapistId: "t-shared", period: { start: at(MON, "08:00"), end: at(MON, "12:00") } },
    rooms: [sharedRoom, privateRoom],
    existingBlocks: [],
    templates,
    actor: "therapist" as const,
    now,
    ...overrides,
  });

  it("allows a free block in an active shared room", () => {
    expect(canReserveBlock(input())).toBeNull();
  });

  it("block_taken when someone else (or you) already holds an overlapping block in that room", () => {
    expect(canReserveBlock(input({ existingBlocks: [block(MON, "08:00", "12:00", { therapistId: "other" })] }))).toBe("block_taken");
    expect(canReserveBlock(input({ existingBlocks: [block(MON, "08:00", "12:00", { status: "released" })] }))).toBeNull();
    expect(canReserveBlock(input({ existingBlocks: [block(MON, "08:00", "12:00", { roomId: "room-2" })] }))).toBeNull();
  });

  it("two therapists reserve the same block: first wins, second gets block_taken", () => {
    const first = input();
    expect(canReserveBlock(first)).toBeNull();
    const stored = block(MON, "08:00", "12:00", { therapistId: "t-shared" });
    expect(canReserveBlock(input({ block: { ...first.block, therapistId: "t-two" }, existingBlocks: [stored] }))).toBe("block_taken");
  });

  it("only in active shared rooms", () => {
    expect(canReserveBlock(input({ block: { ...input().block, roomId: privateRoom.id } }))).toBe("invalid");
    expect(canReserveBlock(input({ rooms: [{ ...sharedRoom, active: false }] }))).toBe("invalid");
    expect(canReserveBlock(input({ block: { ...input().block, roomId: "nope" } }))).toBe("not_found");
  });

  it("therapists: future only and must match an active template; admin may override both", () => {
    const past = { ...input().block, period: { start: at("2026-10-20", "08:00"), end: at("2026-10-20", "12:00") } };
    expect(canReserveBlock(input({ block: past }))).toBe("forbidden");
    expect(canReserveBlock(input({ block: past, actor: "admin" }))).toBeNull();
    const odd = { ...input().block, period: { start: at(MON, "08:00"), end: at(MON, "11:00") } };
    expect(canReserveBlock(input({ block: odd }))).toBe("invalid");
    expect(canReserveBlock(input({ block: odd, actor: "admin" }))).toBeNull();
  });
});

describe("canReleaseBlock (D14)", () => {
  const b = block(MON);
  const ctx = { block: b, appointments: [], actor: "therapist" as const, now };

  it("allows releasing an empty future block", () => {
    expect(canReleaseBlock(ctx)).toBeNull();
  });

  it("refuses when the block holds held or confirmed appointments, for admin too", () => {
    const confirmed = appointment(MON, "09:00", 60, 0, { roomBlockId: b.id });
    expect(canReleaseBlock({ ...ctx, appointments: [confirmed] })).toBe("block_has_appointments");
    expect(canReleaseBlock({ ...ctx, actor: "admin", appointments: [confirmed] })).toBe("block_has_appointments");
    const liveHold = appointment(MON, "10:00", 60, 0, { status: "held", holdExpiresAt: at("2026-10-25", "12:10") });
    expect(canReleaseBlock({ ...ctx, appointments: [liveHold] })).toBe("block_has_appointments");
  });

  it("cancelled appointments and expired holds do not keep a block", () => {
    const cancelled = appointment(MON, "09:00", 60, 0, { roomBlockId: b.id, status: "cancelled" });
    const expired = appointment(MON, "10:00", 60, 0, { roomBlockId: b.id, status: "held", holdExpiresAt: at("2026-10-25", "11:00") });
    expect(canReleaseBlock({ ...ctx, appointments: [cancelled, expired] })).toBeNull();
  });

  it("therapists cannot release a block that has started; admin can", () => {
    const started = { ...ctx, now: at(MON, "09:00") };
    expect(canReleaseBlock(started)).toBe("forbidden");
    expect(canReleaseBlock({ ...started, actor: "admin" })).toBeNull();
  });

  it("an already released block is invalid", () => {
    expect(canReleaseBlock({ ...ctx, block: { ...b, status: "released" } })).toBe("invalid");
  });
});
