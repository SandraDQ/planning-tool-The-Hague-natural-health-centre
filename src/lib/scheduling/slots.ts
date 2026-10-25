// Step 3 of PLAN.md 4: slot starts on a 15-minute local grid, plus the full pipeline.
import type { Appointment, AvailabilityRule, Id, Interval, PaperWindow, Room, RoomBlock, Slot, Therapist, TimeOff } from "@/lib/domain/types";
import { isActiveAppointment } from "./holds";
import { type Instant, MINUTE_MS, msInterval, overlaps, toIso, toMs } from "./intervals";
import { CENTRE_TIME_ZONE, tzOffsetMinutes } from "./tz";
import { type CandidateWindow, candidateWindows, sortWindows, subtractBusy } from "./windows";

export const DEFAULT_GRID_MINUTES = 15;

/** A bookable start. `paperWindowId` tells the store which paper window the booking fills. */
export interface EngineSlot extends Slot {
  paperWindowId: Id | null;
}

export interface GenerateSlotsInput {
  windows: CandidateWindow[];
  durationMin: number;
  bufferMinutes: number;
  gridMinutes?: number;
  /** Slots must start at or after now + minNoticeMin. Omit for no time filter. */
  now?: Instant;
  minNoticeMin?: number;
  /** Only return slots whose start lies in [start, end). */
  range?: Interval;
  timeZone?: string;
}

const isWholeNonNegative = (n: number) => Number.isInteger(n) && n >= 0;

/** First instant >= ms that lies on the local grid (Amsterdam offsets are whole hours, but stay general). */
function ceilToLocalGrid(ms: number, gridMs: number, tz: string): number {
  const local = ms + tzOffsetMinutes(ms, tz) * MINUTE_MS;
  const rem = ((local % gridMs) + gridMs) % gridMs;
  return rem === 0 ? ms : ms + (gridMs - rem);
}

/**
 * Slot starts where the session (+ buffer) fits fully, on the local grid.
 * Windows should already have busy time removed (subtractBusy). Duplicate starts
 * (same moment in two rooms) are returned once, preferring blocks over working hours.
 */
export function generateSlots(input: GenerateSlotsInput): EngineSlot[] {
  const { durationMin, bufferMinutes } = input;
  const grid = input.gridMinutes ?? DEFAULT_GRID_MINUTES;
  const tz = input.timeZone ?? CENTRE_TIME_ZONE;
  if (!Number.isInteger(durationMin) || durationMin <= 0 || !isWholeNonNegative(bufferMinutes)) return [];
  if (!Number.isInteger(grid) || grid <= 0) return [];
  const gridMs = grid * MINUTE_MS;
  const sessionMs = durationMin * MINUTE_MS;
  const occupiedMs = (durationMin + bufferMinutes) * MINUTE_MS;

  let earliest = -Infinity;
  if (input.now !== undefined) earliest = toMs(input.now) + Math.max(0, input.minNoticeMin ?? 0) * MINUTE_MS;
  let rangeEnd = Infinity;
  if (input.range) {
    const r = msInterval(input.range);
    earliest = Math.max(earliest, r.start);
    rangeEnd = r.end;
  }

  const seen = new Set<number>();
  const out: EngineSlot[] = [];
  for (const w of sortWindows(input.windows)) {
    const ws = Date.parse(w.start);
    const we = Date.parse(w.end);
    if (!(ws < we)) continue;
    const occLimit = w.fit === "occupied" ? we : w.occupiedLimit ? Date.parse(w.occupiedLimit) : Infinity;
    for (let s = ceilToLocalGrid(Math.max(ws, earliest), gridMs, tz); s < we && s < rangeEnd; s += gridMs) {
      if (s + sessionMs > we || s + occupiedMs > occLimit) break; // later starts only end later
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({
        therapistId: w.therapistId,
        roomId: w.roomId,
        roomBlockId: w.roomBlockId,
        paperWindowId: w.paperWindowId,
        session: { start: toIso(s), end: toIso(s + sessionMs) },
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.session.start) - Date.parse(b.session.start));
}

export interface FindSlotsInput {
  therapist: Pick<Therapist, "id" | "paperCalendar" | "bufferMinutes">;
  rooms: Room[];
  /** Session type duration (current setting). */
  durationMin: number;
  /** Defaults to therapist.bufferMinutes. */
  bufferMinutes?: number;
  availabilityRules: AvailabilityRule[];
  roomBlocks: RoomBlock[];
  paperWindows: PaperWindow[];
  timeOff: TimeOff[];
  /** Busy times from a connected personal calendar (7A). */
  externalBusy: Interval[];
  /** Appointments of this therapist and of the rooms involved; inactive ones are ignored. */
  appointments: Appointment[];
  range: Interval;
  now?: Instant;
  minNoticeMin?: number;
  gridMinutes?: number;
  timeZone?: string;
}

/**
 * The whole pipeline for one therapist and one session length:
 * candidate windows -> minus time off, external busy, held/confirmed appointments
 * (their stored `occupied`, i.e. their own snapshot buffer) -> slots.
 */
export function findSlots(input: FindSlotsInput): EngineSlot[] {
  const { therapist, now } = input;
  const active = input.appointments.filter((a) => isActiveAppointment(a, now));

  let windows = candidateWindows({
    therapist,
    rooms: input.rooms,
    availabilityRules: input.availabilityRules,
    roomBlocks: input.roomBlocks,
    paperWindows: input.paperWindows,
    range: input.range,
    timeZone: input.timeZone,
  });

  // A paper window closes once booked, even if the store has not flipped its status yet.
  windows = windows.filter((w) => {
    if (!w.paperWindowId) return true;
    const p = msInterval(w);
    return !active.some((a) => a.therapistId === therapist.id && overlaps(msInterval(a.session), p));
  });

  const therapistBusy: Interval[] = [
    ...input.timeOff.filter((t) => t.therapistId === therapist.id).map((t) => t.period),
    ...input.externalBusy,
    ...active.filter((a) => a.therapistId === therapist.id).map((a) => a.occupied),
  ];

  const free: CandidateWindow[] = [];
  for (const roomId of new Set(windows.map((w) => w.roomId))) {
    const roomBusy = active.filter((a) => a.roomId === roomId && a.therapistId !== therapist.id).map((a) => a.occupied);
    free.push(...subtractBusy(windows.filter((w) => w.roomId === roomId), [...therapistBusy, ...roomBusy]));
  }

  return generateSlots({
    windows: free,
    durationMin: input.durationMin,
    bufferMinutes: input.bufferMinutes ?? therapist.bufferMinutes,
    gridMinutes: input.gridMinutes,
    now,
    minNoticeMin: input.minNoticeMin,
    range: input.range,
    timeZone: input.timeZone,
  });
}

/**
 * Live preview (3.3): how many sessions fit in a block of `blockMinutes`,
 * packed back to back on the slot grid, each with its buffer inside the block.
 */
export function sessionsThatFit(input: { blockMinutes: number; durationMin: number; bufferMinutes: number; gridMinutes?: number }): number {
  const { blockMinutes, durationMin, bufferMinutes } = input;
  const grid = input.gridMinutes ?? DEFAULT_GRID_MINUTES;
  if (!(durationMin > 0) || !(bufferMinutes >= 0) || !(grid > 0) || !(blockMinutes > 0)) return 0;
  const occupied = durationMin + bufferMinutes;
  if (occupied > blockMinutes) return 0;
  const step = Math.ceil(occupied / grid) * grid;
  return Math.floor((blockMinutes - occupied) / step) + 1;
}
