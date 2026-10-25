// Step 1 and 2 of PLAN.md 4: candidate windows per therapist, minus busy time.
import type { AvailabilityRule, Id, Interval, Iso, PaperWindow, Room, RoomBlock, Therapist } from "@/lib/domain/types";
import { contains, isValidInterval, mergeIntervals, msInterval, overlaps, subtractIntervals, toIso } from "./intervals";
import { CENTRE_TIME_ZONE, addDays, datesBetween, isoWeekday, localToUtcMs, parseTime, utcToLocal } from "./tz";

export type WindowSource = "block" | "paper" | "availability";

/** A stretch of time in one room in which sessions may start. */
export interface CandidateWindow {
  therapistId: Id;
  roomId: Id;
  /** Shared rooms: the reserved block that contains the window. */
  roomBlockId: Id | null;
  /** Paper-calendar therapists: the admin-opened window. */
  paperWindowId: Id | null;
  source: WindowSource;
  start: Iso;
  end: Iso;
  /**
   * "occupied": session + buffer must end by `end` (blocks, working hours).
   * "session": only the session must end by `end` (paper windows, as the DB checks);
   * the buffer must end by `occupiedLimit` (block end, next busy time) when set.
   */
  fit: "occupied" | "session";
  occupiedLimit: Iso | null;
}

export interface CandidateWindowsInput {
  therapist: Pick<Therapist, "id" | "paperCalendar">;
  rooms: Room[];
  availabilityRules: AvailabilityRule[];
  roomBlocks: RoomBlock[];
  paperWindows: PaperWindow[];
  /** Windows that overlap [start, end) are returned whole (not clipped). */
  range: Interval;
  timeZone?: string;
}

const SOURCE_ORDER: Record<WindowSource, number> = { block: 0, paper: 1, availability: 2 };

export function sortWindows(windows: CandidateWindow[]): CandidateWindow[] {
  return [...windows].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source],
  );
}

/**
 * Where may this therapist be booked?
 *  - paper-calendar therapist: open paper windows only (in a shared room inside one of their reserved blocks);
 *  - otherwise: their reserved blocks in active shared rooms
 *    + their weekly working hours in an active private room assigned to them.
 * Working hours never open a shared room: a shared-room therapist without a block has no windows.
 */
export function candidateWindows(input: CandidateWindowsInput): CandidateWindow[] {
  const { therapist, rooms, range } = input;
  const tz = input.timeZone ?? CENTRE_TIME_ZONE;
  const r = msInterval(range);
  if (!isValidInterval(r)) return [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const ownBlocks = input.roomBlocks.filter((b) => b.therapistId === therapist.id && b.status === "reserved");
  const out: CandidateWindow[] = [];

  if (therapist.paperCalendar) {
    for (const pw of input.paperWindows) {
      if (pw.therapistId !== therapist.id || pw.status !== "open") continue;
      const p = msInterval(pw.period);
      if (!isValidInterval(p) || !overlaps(p, r)) continue;
      const room = roomById.get(pw.roomId);
      if (!room?.active) continue;
      let roomBlockId: Id | null = null;
      let occupiedLimit: Iso | null = null;
      if (room.kind === "shared") {
        const host = ownBlocks.find((b) => b.roomId === room.id && contains(msInterval(b.period), p));
        if (!host) continue; // DB TH001: paper window must sit inside a block of this therapist
        roomBlockId = host.id;
        occupiedLimit = host.period.end;
      } else if (room.privateTherapistId !== therapist.id) {
        continue; // DB TH002
      }
      out.push({
        therapistId: therapist.id, roomId: room.id, roomBlockId, paperWindowId: pw.id, source: "paper",
        start: pw.period.start, end: pw.period.end, fit: "session", occupiedLimit,
      });
    }
    return sortWindows(out);
  }

  for (const b of ownBlocks) {
    const room = roomById.get(b.roomId);
    if (!room?.active || room.kind !== "shared") continue;
    const p = msInterval(b.period);
    if (!isValidInterval(p) || !overlaps(p, r)) continue;
    out.push({
      therapistId: therapist.id, roomId: room.id, roomBlockId: b.id, paperWindowId: null, source: "block",
      start: b.period.start, end: b.period.end, fit: "occupied", occupiedLimit: null,
    });
  }

  const privateRooms = rooms.filter((room) => room.active && room.kind === "private" && room.privateTherapistId === therapist.id);
  const rules = input.availabilityRules.filter((rule) => rule.therapistId === therapist.id);
  if (privateRooms.length > 0 && rules.length > 0) {
    const ruleIntervals = expandRules(rules, r.start, r.end, tz).filter((i) => overlaps(i, r));
    for (const room of privateRooms) {
      for (const i of ruleIntervals) {
        out.push({
          therapistId: therapist.id, roomId: room.id, roomBlockId: null, paperWindowId: null, source: "availability",
          start: toIso(i.start), end: toIso(i.end), fit: "occupied", occupiedLimit: null,
        });
      }
    }
  }
  return sortWindows(out);
}

/** Weekly rules -> concrete merged UTC intervals for every local date touching [fromMs, toMs). */
function expandRules(rules: AvailabilityRule[], fromMs: number, toMs: number, tz: string) {
  const first = addDays(utcToLocal(fromMs, tz).date, -1);
  const last = addDays(utcToLocal(toMs, tz).date, 1);
  const intervals = [];
  for (const date of datesBetween(first, last)) {
    const wd = isoWeekday(date);
    for (const rule of rules) {
      if (rule.weekday !== wd) continue;
      let s: number, e: number;
      try {
        s = parseTime(rule.startTime);
        e = parseTime(rule.endTime);
      } catch {
        continue; // malformed rule: ignore rather than crash the booking page
      }
      if (e <= s) continue;
      intervals.push({ start: localToUtcMs(date, s, tz), end: localToUtcMs(date, e, tz) });
    }
  }
  return mergeIntervals(intervals);
}

/**
 * Remove busy time from windows. Pieces keep their room/block/paper ids.
 * For "session"-fit windows the buffer may run past the piece, so `occupiedLimit`
 * is tightened to the next busy start.
 */
export function subtractBusy(windows: CandidateWindow[], busy: Interval[]): CandidateWindow[] {
  const cuts = busy.map(msInterval).filter(isValidInterval);
  const out: CandidateWindow[] = [];
  for (const w of windows) {
    for (const piece of subtractIntervals(msInterval(w), cuts)) {
      let occupiedLimit = w.occupiedLimit;
      if (w.fit === "session") {
        let limit = occupiedLimit ? Date.parse(occupiedLimit) : Infinity;
        for (const c of cuts) if (c.end > piece.end && c.start < limit) limit = Math.max(c.start, piece.end);
        occupiedLimit = Number.isFinite(limit) ? toIso(limit) : null;
      }
      out.push({ ...w, start: toIso(piece.start), end: toIso(piece.end), occupiedLimit });
    }
  }
  return out;
}
