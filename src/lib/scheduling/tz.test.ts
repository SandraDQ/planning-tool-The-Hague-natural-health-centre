import { describe, expect, it } from "vitest";
import { addDays, isoWeekday, localToUtc, parseTime, tzOffsetMinutes, utcToLocal } from "./tz";

describe("Europe/Amsterdam time helpers", () => {
  it("knows the offset in winter and summer", () => {
    expect(tzOffsetMinutes(Date.parse("2026-01-15T12:00:00Z"))).toBe(60);
    expect(tzOffsetMinutes(Date.parse("2026-07-15T12:00:00Z"))).toBe(120);
  });

  it("converts local wall time to UTC on both sides of each DST switch", () => {
    // Spring forward: last Sunday of March, 02:00 -> 03:00 local (01:00 UTC).
    expect(localToUtc("2026-03-28", "08:00")).toBe("2026-03-28T07:00:00.000Z");
    expect(localToUtc("2026-03-29", "08:00")).toBe("2026-03-29T06:00:00.000Z");
    expect(localToUtc("2027-03-28", "08:00")).toBe("2027-03-28T06:00:00.000Z");
    // Fall back: last Sunday of October, 03:00 -> 02:00 local (01:00 UTC).
    expect(localToUtc("2026-10-24", "08:00")).toBe("2026-10-24T06:00:00.000Z");
    expect(localToUtc("2026-10-25", "08:00")).toBe("2026-10-25T07:00:00.000Z");
    expect(localToUtc("2027-10-31", "08:00")).toBe("2027-10-31T07:00:00.000Z");
  });

  it("maps a non-existent local time (spring gap) forward, like Postgres", () => {
    // 02:30 does not exist on 2026-03-29; it becomes 03:30 CEST = 01:30 UTC.
    expect(localToUtc("2026-03-29", "02:30")).toBe("2026-03-29T01:30:00.000Z");
  });

  it("maps an ambiguous local time (autumn overlap) to the first occurrence", () => {
    // 02:30 happens twice on 2026-10-25; first at CEST (+2) = 00:30 UTC.
    expect(localToUtc("2026-10-25", "02:30")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("supports 24:00 as the end of the day", () => {
    expect(localToUtc("2026-03-28", "24:00")).toBe(localToUtc("2026-03-29", "00:00"));
  });

  it("converts UTC back to local date, time and ISO weekday", () => {
    expect(utcToLocal("2026-10-25T00:30:00Z")).toMatchObject({ date: "2026-10-25", time: "02:30", weekday: 7 });
    expect(utcToLocal("2026-10-25T01:30:00Z")).toMatchObject({ date: "2026-10-25", time: "02:30", weekday: 7 });
    expect(utcToLocal("2026-03-29T01:00:00Z")).toMatchObject({ date: "2026-03-29", time: "03:00" });
    expect(utcToLocal("2026-12-31T23:30:00Z")).toMatchObject({ date: "2027-01-01", time: "00:30", weekday: 5 });
  });

  it("does calendar arithmetic on dates", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeekday("2026-10-26")).toBe(1);
  });

  it("parses HH:MM", () => {
    expect(parseTime("08:15")).toBe(495);
    expect(parseTime("24:00")).toBe(1440);
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("8:00am")).toThrow();
  });
});
