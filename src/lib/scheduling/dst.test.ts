// DST weekends: last Sunday of March and of October, 2026 and 2027.
// Europe/Amsterdam switches at 01:00 UTC: CET (+1) <-> CEST (+2).
import { describe, expect, it } from "vitest";
import { candidateWindows, expandBlockSeries, findSlots, generateSlots } from "./index";
import { at, block, day, privateRoom, rooms, rule, templates, therapist } from "./test-fixtures";
import type { BlockSeries } from "@/lib/domain/types";

const local = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));

const shared = therapist();
const priv = therapist({ id: "t-private" });

const DST_SUNDAYS = [
  { date: "2026-03-29", kind: "spring", offsetBefore: 60, offsetAfter: 120 },
  { date: "2026-10-25", kind: "autumn", offsetBefore: 120, offsetAfter: 60 },
  { date: "2027-03-28", kind: "spring", offsetBefore: 60, offsetAfter: 120 },
  { date: "2027-10-31", kind: "autumn", offsetBefore: 120, offsetAfter: 60 },
] as const;

describe.each(DST_SUNDAYS)("DST Sunday $date ($kind)", ({ date, offsetAfter }) => {
  it("a 08:00-12:00 block yields the same local slots 08:00..11:00 with the post-switch offset", () => {
    const windows = candidateWindows({ therapist: shared, rooms, availabilityRules: [], roomBlocks: [block(date)], paperWindows: [], range: day(date) });
    const slots = generateSlots({ windows, durationMin: 60, bufferMinutes: 0 });
    expect(slots).toHaveLength(13);
    const first = slots[0].session.start;
    expect(first).toBe(new Date(Date.parse(`${date}T08:00:00Z`) - offsetAfter * 60_000).toISOString());
    expect(local(first)).toContain("08:00");
    expect(local(slots.at(-1)!.session.start)).toContain("11:00");
  });

  it("D24: block narrowed by Sunday working hours 09:00-11:30 keeps local times", () => {
    const windows = candidateWindows({
      therapist: shared, rooms, availabilityRules: [rule(7, "09:00", "11:30", shared.id)], roomBlocks: [block(date)], paperWindows: [], range: day(date),
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].start).toBe(new Date(Date.parse(`${date}T09:00:00Z`) - offsetAfter * 60_000).toISOString());
    expect(windows[0].end).toBe(new Date(Date.parse(`${date}T11:30:00Z`) - offsetAfter * 60_000).toISOString());
    const slots = generateSlots({ windows, durationMin: 60, bufferMinutes: 15 });
    expect(local(slots[0].session.start)).toContain("09:00");
    expect(local(slots.at(-1)!.session.start)).toContain("10:15");
  });

  it("evening block 18:00-22:00 is correct too", () => {
    const windows = candidateWindows({ therapist: shared, rooms, availabilityRules: [], roomBlocks: [block(date, "18:00", "22:00")], paperWindows: [], range: day(date) });
    const slots = generateSlots({ windows, durationMin: 90, bufferMinutes: 15 });
    expect(local(slots[0].session.start)).toContain("18:00");
    expect(local(slots.at(-1)!.session.start)).toContain("20:15");
  });
});

describe("working hours across the switch night (private room)", () => {
  it("spring: 00:00-06:00 local is only 5 real hours; no slot starts in the missing hour", () => {
    const date = "2026-03-29";
    const slots = findSlots({
      therapist: priv, rooms, durationMin: 60, availabilityRules: [rule(7, "00:00", "06:00")], roomBlocks: [], paperWindows: [],
      timeOff: [], externalBusy: [], appointments: [], range: day(date),
    });
    expect(slots[0].session.start).toBe("2026-03-28T23:00:00.000Z");
    expect(slots.at(-1)!.session.start).toBe("2026-03-29T03:00:00.000Z"); // 05:00 CEST
    expect(slots).toHaveLength(17); // 5h window, 60-min sessions, 15-min grid
    const times = slots.map((s) => local(s.session.start));
    expect(times.some((t) => /\b02:\d\d\b/.test(t))).toBe(false);
    expect(times).toContain("29/03/2026, 01:45 CET");
    expect(times).toContain("29/03/2026, 03:00 CEST");
    // Sessions are real elapsed minutes: 01:30 CET + 60 min = 03:30 CEST.
    const s0130 = slots.find((s) => local(s.session.start).includes("01:30"))!;
    expect(local(s0130.session.end)).toContain("03:30 CEST");
  });

  it("autumn: 00:00-06:00 local is 7 real hours; the repeated 02:xx hour is offered twice", () => {
    const date = "2026-10-25";
    const slots = findSlots({
      therapist: priv, rooms, durationMin: 60, availabilityRules: [rule(7, "00:00", "06:00")], roomBlocks: [], paperWindows: [],
      timeOff: [], externalBusy: [], appointments: [], range: day(date),
    });
    expect(slots[0].session.start).toBe("2026-10-24T22:00:00.000Z");
    expect(slots.at(-1)!.session.start).toBe("2026-10-25T04:00:00.000Z"); // 05:00 CET
    expect(slots).toHaveLength(25);
    const times = slots.map((s) => local(s.session.start));
    expect(times).toContain("25/10/2026, 02:30 CEST");
    expect(times).toContain("25/10/2026, 02:30 CET");
    expect(new Set(slots.map((s) => s.session.start)).size).toBe(slots.length);
  });

  it("the day before and after a switch use their own offsets", () => {
    const windows = candidateWindows({
      therapist: priv, rooms, availabilityRules: [rule(6, "09:00", "10:00"), rule(1, "09:00", "10:00")],
      roomBlocks: [], paperWindows: [], range: day("2027-10-30", "2027-11-01"),
    });
    expect(windows.map((w) => w.start)).toEqual(["2027-10-30T07:00:00.000Z", "2027-11-01T08:00:00.000Z"]);
    expect(windows.every((w) => w.roomId === privateRoom.id)).toBe(true);
  });
});

describe("block series expansion across DST", () => {
  const series: BlockSeries = {
    id: "s-1", roomId: "room-1", therapistId: "t-shared", weekday: 7, blockTemplateId: "bt-am", startsOn: "2026-03-15", endsOn: null,
  };

  it("every Sunday 08:00-12:00 stays 08:00 local through the March switch", () => {
    const blocks = expandBlockSeries(series, templates, { start: at("2026-03-01", "00:00"), end: at("2026-04-06", "00:00") });
    expect(blocks.map((b) => b.period.start)).toEqual([
      "2026-03-15T07:00:00.000Z",
      "2026-03-22T07:00:00.000Z",
      "2026-03-29T06:00:00.000Z",
      "2026-04-05T06:00:00.000Z",
    ]);
    expect(blocks.every((b) => local(b.period.start).includes("08:00") && local(b.period.end).includes("12:00"))).toBe(true);
  });

  it("through the October 2027 switch", () => {
    const blocks = expandBlockSeries({ ...series, startsOn: "2027-10-01" }, templates, { start: at("2027-10-20", "00:00"), end: at("2027-11-10", "00:00") });
    expect(blocks.map((b) => b.period.start)).toEqual([
      "2027-10-24T06:00:00.000Z",
      "2027-10-31T07:00:00.000Z",
      "2027-11-07T07:00:00.000Z",
    ]);
    expect(blocks.every((b) => Date.parse(b.period.end) - Date.parse(b.period.start) === 4 * 3600_000)).toBe(true);
  });
});
