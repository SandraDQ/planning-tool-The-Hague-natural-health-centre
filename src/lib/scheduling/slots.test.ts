import { describe, expect, it } from "vitest";
import { candidateWindows, findSlots, generateSlots, sessionsThatFit, subtractBusy } from "./index";
import { appointment, at, block, day, paperWindow, privateRoom, rooms, rule, sharedRoom, therapist } from "./test-fixtures";

const localStarts = (slots: { session: { start: string } }[]) =>
  slots.map((s) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(s.session.start)));

const shared = therapist();
const priv = therapist({ id: "t-private", slug: "piet" });
const paper = therapist({ id: "t-paper", slug: "pam", paperCalendar: true });

// Monday 2026-11-02
const MON = "2026-11-02";

describe("candidateWindows", () => {
  it("shared-room therapist without a block has no windows (and so no slots)", () => {
    const w = candidateWindows({
      therapist: shared,
      rooms,
      availabilityRules: [rule(1, "09:00", "17:00", shared.id)], // rules alone never open a shared room
      roomBlocks: [],
      paperWindows: [],
      range: day(MON),
    });
    expect(w).toEqual([]);
    expect(
      findSlots({
        therapist: shared, rooms, durationMin: 60, availabilityRules: [], roomBlocks: [], paperWindows: [],
        timeOff: [], externalBusy: [], appointments: [], range: day(MON),
      }),
    ).toEqual([]);
  });

  it("shared-room therapist: only their own reserved blocks", () => {
    const w = candidateWindows({
      therapist: shared,
      rooms,
      availabilityRules: [],
      roomBlocks: [
        block(MON),
        block(MON, "13:00", "17:00", { status: "released" }),
        block(MON, "18:00", "22:00", { therapistId: "someone-else" }),
      ],
      paperWindows: [],
      range: day(MON),
    });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ roomId: sharedRoom.id, roomBlockId: `blk-${MON}-08:00`, start: at(MON, "08:00"), end: at(MON, "12:00"), fit: "occupied" });
  });

  describe("D24: shared-room blocks intersected with working hours", () => {
    const blocks = [block(MON), block(MON, "13:00", "17:00")];
    const win = (availabilityRules: ReturnType<typeof rule>[]) =>
      candidateWindows({ therapist: shared, rooms, availabilityRules, roomBlocks: blocks, paperWindows: [], range: day(MON) });

    it("no working hours set: the whole block is bookable", () => {
      expect(win([]).map((w) => [w.start, w.end])).toEqual([
        [at(MON, "08:00"), at(MON, "12:00")],
        [at(MON, "13:00"), at(MON, "17:00")],
      ]);
    });

    it("working hours narrow each block; the block id is kept", () => {
      const w = win([rule(1, "09:30", "15:00", shared.id)]);
      expect(w.map((x) => [x.start, x.end, x.roomBlockId])).toEqual([
        [at(MON, "09:30"), at(MON, "12:00"), `blk-${MON}-08:00`],
        [at(MON, "13:00"), at(MON, "15:00"), `blk-${MON}-13:00`],
      ]);
      const slots = findSlots({
        therapist: shared, rooms, durationMin: 60, availabilityRules: [rule(1, "09:30", "15:00", shared.id)], roomBlocks: blocks,
        paperWindows: [], timeOff: [], externalBusy: [], appointments: [], range: day(MON),
      });
      expect(localStarts(slots)[0]).toBe("09:30");
      expect(localStarts(slots).at(-1)).toBe("14:00");
      expect(slots.every((s) => s.roomBlockId)).toBe(true);
    });

    it("split working hours give split windows inside one block", () => {
      const w = win([rule(1, "08:00", "09:00", shared.id), rule(1, "10:00", "11:00", shared.id)]);
      expect(w.filter((x) => x.roomBlockId === `blk-${MON}-08:00`).map((x) => [x.start, x.end])).toEqual([
        [at(MON, "08:00"), at(MON, "09:00")],
        [at(MON, "10:00"), at(MON, "11:00")],
      ]);
    });

    it("working hours on other weekdays only: the block has no bookable time that day", () => {
      expect(win([rule(2, "08:00", "17:00", shared.id)])).toEqual([]);
    });

    it("another therapist's rules do not narrow this therapist's blocks", () => {
      expect(win([rule(1, "09:00", "10:00", "someone-else")])).toHaveLength(2);
    });
  });

  it("private-room therapist: weekly working hours in their own room, overlapping rules merged", () => {
    const w = candidateWindows({
      therapist: priv,
      rooms,
      availabilityRules: [rule(1, "09:00", "12:00"), rule(1, "11:00", "13:00"), rule(2, "09:00", "17:00")],
      roomBlocks: [],
      paperWindows: [],
      range: day(MON),
    });
    expect(w).toEqual([
      expect.objectContaining({ roomId: privateRoom.id, roomBlockId: null, start: at(MON, "09:00"), end: at(MON, "13:00") }),
    ]);
  });

  it("paper-calendar therapist: open paper windows only, nothing else", () => {
    const w = candidateWindows({
      therapist: paper,
      rooms: [...rooms, { ...privateRoom, id: "room-4", number: 4, privateTherapistId: "t-paper" }],
      availabilityRules: [rule(1, "09:00", "17:00", paper.id)],
      roomBlocks: [block(MON, "08:00", "12:00", { therapistId: paper.id })],
      paperWindows: [
        paperWindow(MON, "14:00", "16:00", { roomId: "room-4" }),
        paperWindow(MON, "16:00", "17:00", { roomId: "room-4", status: "filled" }),
      ],
      range: day(MON),
    });
    expect(w).toEqual([expect.objectContaining({ paperWindowId: `pw-${MON}-14:00`, start: at(MON, "14:00"), end: at(MON, "16:00"), fit: "session" })]);
  });

  it("paper window in a shared room needs a reserved block of that therapist around it", () => {
    const base = {
      therapist: paper, rooms, availabilityRules: [],
      paperWindows: [paperWindow(MON, "09:00", "11:00", { roomId: sharedRoom.id })],
      range: day(MON),
    };
    expect(candidateWindows({ ...base, roomBlocks: [] })).toEqual([]);
    const w = candidateWindows({ ...base, roomBlocks: [block(MON, "08:00", "12:00", { therapistId: paper.id })] });
    expect(w[0]).toMatchObject({ roomBlockId: `blk-${MON}-08:00`, occupiedLimit: at(MON, "12:00") });
  });
});

describe("subtractBusy", () => {
  it("cuts busy time out of windows", () => {
    const w = candidateWindows({ therapist: shared, rooms, availabilityRules: [], roomBlocks: [block(MON)], paperWindows: [], range: day(MON) });
    const out = subtractBusy(w, [{ start: at(MON, "09:00"), end: at(MON, "10:00") }, { start: at(MON, "11:30"), end: at(MON, "13:00") }]);
    expect(out.map((x) => [x.start, x.end])).toEqual([
      [at(MON, "08:00"), at(MON, "09:00")],
      [at(MON, "10:00"), at(MON, "11:30")],
    ]);
  });
});

describe("generateSlots", () => {
  const blockWindows = () =>
    candidateWindows({ therapist: shared, rooms, availabilityRules: [], roomBlocks: [block(MON)], paperWindows: [], range: day(MON) });

  it("a session can never run past the block end", () => {
    const slots = generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 0 });
    expect(localStarts(slots).at(-1)).toBe("11:00");
    expect(slots.every((s) => Date.parse(s.session.end) <= Date.parse(at(MON, "12:00")))).toBe(true);
    // 4-hour session fits exactly once; 4h05 does not fit at all.
    expect(generateSlots({ windows: blockWindows(), durationMin: 240, bufferMinutes: 0 })).toHaveLength(1);
    expect(generateSlots({ windows: blockWindows(), durationMin: 245, bufferMinutes: 0 })).toHaveLength(0);
  });

  it("buffer 0 / 15 / 45 changes the last possible start (session + buffer must fit)", () => {
    const last = (buffer: number) => localStarts(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: buffer })).at(-1);
    expect(last(0)).toBe("11:00");
    expect(last(15)).toBe("10:45");
    expect(last(45)).toBe("10:15");
    expect(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 0 })).toHaveLength(13);
    expect(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 15 })).toHaveLength(12);
    expect(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 45 })).toHaveLength(10);
  });

  it("starts on a 15-minute local grid even when a window starts off-grid", () => {
    const w = subtractBusy(blockWindows(), [{ start: at(MON, "08:00"), end: at(MON, "08:50") }]);
    expect(localStarts(generateSlots({ windows: w, durationMin: 50, bufferMinutes: 0 })).slice(0, 2)).toEqual(["09:00", "09:15"]);
  });

  it("respects now and an optional minimum notice", () => {
    const now = at(MON, "09:05");
    expect(localStarts(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 0, now }))[0]).toBe("09:15");
    expect(localStarts(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 0, now, minNoticeMin: 60 }))[0]).toBe("10:15");
  });

  it("only returns starts inside the requested range", () => {
    const slots = generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: 0, range: { start: at(MON, "10:00"), end: at(MON, "10:30") } });
    expect(localStarts(slots)).toEqual(["10:00", "10:15"]);
  });

  it("rejects nonsense input by returning no slots", () => {
    expect(generateSlots({ windows: blockWindows(), durationMin: 0, bufferMinutes: 0 })).toEqual([]);
    expect(generateSlots({ windows: blockWindows(), durationMin: 60, bufferMinutes: -5 })).toEqual([]);
  });
});

describe("findSlots (whole pipeline)", () => {
  const base = {
    therapist: shared,
    rooms,
    durationMin: 60,
    availabilityRules: [],
    roomBlocks: [block(MON)],
    paperWindows: [],
    timeOff: [],
    externalBusy: [],
    appointments: [],
    range: day(MON),
  };

  it("existing held/confirmed appointments block their occupied time (incl. their buffer)", () => {
    const slots = findSlots({ ...base, appointments: [appointment(MON, "09:00", 60, 30)] });
    const starts = localStarts(slots);
    expect(starts).toContain("08:00");
    expect(starts).not.toContain("08:15"); // 08:15-09:15 would overlap 09:00
    expect(starts).not.toContain("10:15"); // buffer runs until 10:30
    expect(starts).toContain("10:30");
  });

  it("a manual booking entered by the therapist blocks the slot", () => {
    const manual = appointment(MON, "10:00", 60, 0, { source: "manual" });
    const starts = localStarts(findSlots({ ...base, appointments: [manual] }));
    expect(starts).not.toContain("10:00");
    expect(starts).not.toContain("09:15");
    expect(starts).toContain("09:00");
    expect(starts).toContain("11:00");
  });

  it("cancelled appointments and expired holds free the time again", () => {
    const now = at(MON, "07:00");
    const cancelled = appointment(MON, "09:00", 60, 0, { status: "cancelled" });
    const expiredHold = appointment(MON, "10:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "06:59") });
    const liveHold = appointment(MON, "11:00", 60, 0, { status: "held", holdExpiresAt: at(MON, "07:10") });
    const starts = localStarts(findSlots({ ...base, now, appointments: [cancelled, expiredHold, liveHold] }));
    expect(starts).toContain("09:00");
    expect(starts).toContain("10:00");
    expect(starts).not.toContain("11:00");
  });

  it("time off and external busy times remove slots", () => {
    const starts = localStarts(
      findSlots({
        ...base,
        timeOff: [{ id: "to", therapistId: shared.id, note: null, period: { start: at(MON, "08:00"), end: at(MON, "10:00") } }],
        externalBusy: [{ start: at(MON, "11:00"), end: at(MON, "11:30") }],
      }),
    );
    expect(starts).toEqual(["10:00"]);
  });

  it("another therapist's appointment in the same room blocks it (room-level overlap)", () => {
    const other = appointment(MON, "08:00", 60, 0, { therapistId: "intruder" });
    expect(localStarts(findSlots({ ...base, appointments: [other] }))[0]).toBe("09:00");
  });

  it("buffer change applies to new slots only; existing appointments keep their snapshot", () => {
    // Booked with 60 min + 15 buffer. Therapist later switches to 90 min + 45 buffer.
    const existing = appointment(MON, "08:00", 60, 15);
    const t2 = therapist({ bufferMinutes: 45 });
    const slots = findSlots({ ...base, therapist: t2, durationMin: 90, appointments: [existing] });
    // Existing still occupies only 08:00-09:15 (its snapshot), so 09:15 is free:
    expect(localStarts(slots)[0]).toBe("09:15");
    // New slots use the new duration + buffer: last start = 12:00 - 135 min = 09:45.
    expect(localStarts(slots).at(-1)).toBe("09:45");
    expect(existing.occupied.end).toBe(at(MON, "09:15"));
    expect(existing.snapshot).toMatchObject({ durationMin: 60, bufferMinutes: 15, priceCents: 8000 });
  });

  it("paper window offers slots until it is booked once, then closes", () => {
    const pw = paperWindow(MON, "14:00", "16:00");
    const paperBase = { ...base, therapist: paper, rooms: [sharedRoom, { ...privateRoom, privateTherapistId: paper.id }], roomBlocks: [], paperWindows: [pw] };
    const open = findSlots(paperBase);
    expect(localStarts(open)[0]).toBe("14:00");
    expect(localStarts(open).at(-1)).toBe("15:00");
    expect(open[0]).toMatchObject({ paperWindowId: pw.id, roomId: privateRoom.id });

    // Status already "filled" -> closed.
    expect(findSlots({ ...paperBase, paperWindows: [{ ...pw, status: "filled" }] })).toEqual([]);
    // Store has not flipped the status yet but a hold exists inside -> still closed.
    const hold = appointment(MON, "14:30", 60, 0, { therapistId: paper.id, roomId: privateRoom.id, status: "held", holdExpiresAt: at(MON, "13:00") });
    expect(findSlots({ ...paperBase, now: at(MON, "12:55"), appointments: [hold] })).toEqual([]);
  });

  it("paper window: the session must fit, the buffer may run past the window but not into busy time", () => {
    const pw = paperWindow(MON, "14:00", "15:00");
    const paperBase = { ...base, therapist: therapist({ ...paper, bufferMinutes: 15 }), rooms: [{ ...privateRoom, privateTherapistId: paper.id }], roomBlocks: [], paperWindows: [pw] };
    expect(localStarts(findSlots(paperBase))).toEqual(["14:00"]);
    const busy = { start: at(MON, "15:00"), end: at(MON, "16:00") };
    expect(findSlots({ ...paperBase, externalBusy: [busy] })).toEqual([]);
  });

  it("slots in two rooms at the same moment are returned once", () => {
    const both = therapist({ id: "t-private" });
    const slots = findSlots({
      ...base,
      therapist: both,
      availabilityRules: [rule(1, "08:00", "09:00")],
      roomBlocks: [block(MON, "08:00", "12:00", { therapistId: both.id })],
    });
    const starts = slots.map((s) => s.session.start);
    expect(new Set(starts).size).toBe(starts.length);
  });
});

describe("sessionsThatFit (live preview)", () => {
  it("counts sessions in a block on the 15-minute grid", () => {
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 60, bufferMinutes: 0 })).toBe(4);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 60, bufferMinutes: 15 })).toBe(3);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 60, bufferMinutes: 45 })).toBe(2);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 45, bufferMinutes: 15 })).toBe(4);
    // 50 + 0: starts 0, 60, 120, 180 (grid) -> 4, not floor(240/50)=4... and 55 + 0 also 4
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 55, bufferMinutes: 0 })).toBe(4);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 70, bufferMinutes: 0 })).toBe(3);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 240, bufferMinutes: 0 })).toBe(1);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 240, bufferMinutes: 5 })).toBe(0);
    expect(sessionsThatFit({ blockMinutes: 240, durationMin: 0, bufferMinutes: 0 })).toBe(0);
  });

  it("agrees with generateSlots when packed back to back", () => {
    for (const [d, b] of [[60, 0], [60, 15], [45, 15], [90, 30], [50, 10], [75, 5]]) {
      const n = sessionsThatFit({ blockMinutes: 240, durationMin: d, bufferMinutes: b });
      // Greedy packing of the engine's own slots.
      let count = 0;
      let freeFrom = Date.parse(at(MON, "08:00"));
      const windows = candidateWindows({ therapist: shared, rooms, availabilityRules: [], roomBlocks: [block(MON)], paperWindows: [], range: day(MON) });
      for (const s of generateSlots({ windows, durationMin: d, bufferMinutes: b })) {
        if (Date.parse(s.session.start) >= freeFrom) {
          count++;
          freeFrom = Date.parse(s.session.start) + (d + b) * 60_000;
        }
      }
      expect(count, `${d}+${b}`).toBe(n);
    }
  });
});
