// Room layer (3.1): block series expansion and reserve/release rules.
import type { Appointment, BlockSeries, BlockTemplate, Id, Interval, Room, RoomBlock } from "@/lib/domain/types";
import type { DomainErrorCode } from "@/lib/domain/store";
import { isActiveAppointment } from "./holds";
import { type Instant, isValidInterval, msInterval, overlaps, toIso, toMs } from "./intervals";
import { CENTRE_TIME_ZONE, addDays, datesBetween, isoWeekday, localToUtcMs, parseTime, utcToLocal } from "./tz";

/** A block template on a local date, as a UTC period. */
export function blockPeriod(date: string, template: Pick<BlockTemplate, "startTime" | "endTime">, timeZone = CENTRE_TIME_ZONE): Interval {
  return {
    start: toIso(localToUtcMs(date, parseTime(template.startTime), timeZone)),
    end: toIso(localToUtcMs(date, parseTime(template.endTime), timeZone)),
  };
}

export interface ExpandOptions {
  /** Rows already stored; dates that have a row for this series (any status) are skipped. */
  existing?: RoomBlock[];
  /** Id for a generated block. Default `${series.id}:${date}` (stable, so re-running is idempotent). */
  idFor?: (series: BlockSeries, date: string) => Id;
  timeZone?: string;
}

/**
 * Weekly series -> concrete reserved blocks overlapping `range` (D3).
 * Local template times on every matching weekday from startsOn to endsOn (inclusive), DST-safe.
 * An unknown or inactive template yields nothing.
 */
export function expandBlockSeries(series: BlockSeries, templates: BlockTemplate[], range: Interval, options: ExpandOptions = {}): RoomBlock[] {
  const tz = options.timeZone ?? CENTRE_TIME_ZONE;
  const template = templates.find((t) => t.id === series.blockTemplateId);
  if (!template?.active) return [];
  let startMin: number, endMin: number;
  try {
    startMin = parseTime(template.startTime);
    endMin = parseTime(template.endTime);
  } catch {
    return [];
  }
  if (endMin <= startMin) return [];
  const r = msInterval(range);
  if (!isValidInterval(r)) return [];

  const fromLocal = addDays(utcToLocal(r.start, tz).date, -1);
  const toLocal = utcToLocal(r.end, tz).date;
  const first = series.startsOn > fromLocal ? series.startsOn : fromLocal;
  const last = series.endsOn && series.endsOn < toLocal ? series.endsOn : toLocal;
  if (first > last) return [];

  const takenStarts = new Set(
    (options.existing ?? []).filter((b) => b.seriesId === series.id).map((b) => Date.parse(b.period.start)),
  );
  const idFor = options.idFor ?? ((s, date) => `${s.id}:${date}`);
  const out: RoomBlock[] = [];
  for (const date of datesBetween(first, last)) {
    if (isoWeekday(date) !== series.weekday) continue;
    const p = { start: localToUtcMs(date, startMin, tz), end: localToUtcMs(date, endMin, tz) };
    if (!overlaps(p, r) || takenStarts.has(p.start)) continue;
    out.push({
      id: idFor(series, date),
      roomId: series.roomId,
      therapistId: series.therapistId,
      period: { start: toIso(p.start), end: toIso(p.end) },
      seriesId: series.id,
      status: "reserved",
    });
  }
  return out;
}

export type BlockActor = "therapist" | "admin";

export interface CanReserveBlockInput {
  block: { id?: Id; roomId: Id; therapistId: Id; period: Interval };
  rooms: Room[];
  /** Blocks in the same room (others are ignored). */
  existingBlocks: RoomBlock[];
  templates: BlockTemplate[];
  actor: BlockActor;
  now: Instant;
  timeZone?: string;
}

/**
 * May this block be reserved? Mirrors the room_blocks triggers:
 * active shared room (TH006), one reserved block per room at a time (exclusion -> block_taken),
 * therapists only in the future (TH009) and only on an active template (TH006). Admin may override the last two.
 */
export function canReserveBlock(input: CanReserveBlockInput): DomainErrorCode | null {
  const { block, actor } = input;
  const tz = input.timeZone ?? CENTRE_TIME_ZONE;
  const p = msInterval(block.period);
  if (!isValidInterval(p)) return "invalid";
  const room = input.rooms.find((r) => r.id === block.roomId);
  if (!room) return "not_found";
  if (!room.active || room.kind !== "shared") return "invalid";

  if (actor === "therapist") {
    if (p.start <= toMs(input.now)) return "forbidden";
    const s = utcToLocal(p.start, tz);
    const e = utcToLocal(p.end, tz);
    const matches = input.templates.some(
      (t) => t.active && t.startTime === s.time && t.endTime === e.time && s.date === e.date,
    );
    if (!matches) return "invalid";
  }

  const clash = input.existingBlocks.some(
    (b) => b.id !== block.id && b.status === "reserved" && b.roomId === block.roomId && overlaps(msInterval(b.period), p),
  );
  return clash ? "block_taken" : null;
}

export interface CanReleaseBlockInput {
  block: RoomBlock;
  /** Appointments of this therapist / room (others are ignored). */
  appointments: Appointment[];
  actor: BlockActor;
  now: Instant;
}

/**
 * May this block be released? Never while it holds held/confirmed appointments, for anyone (D14).
 * Expired holds do not count: the store must cancel them first, as the DB's pg_cron job does.
 * Therapists cannot release a block that has started (TH009); admin can.
 */
export function canReleaseBlock(input: CanReleaseBlockInput): DomainErrorCode | null {
  const { block, now } = input;
  if (block.status !== "reserved") return "invalid";
  const p = msInterval(block.period);
  if (input.actor === "therapist" && p.start <= toMs(now)) return "forbidden";
  const busy = input.appointments.some(
    (a) =>
      isActiveAppointment(a, now) &&
      (a.roomBlockId === block.id ||
        (a.roomId === block.roomId && a.therapistId === block.therapistId && overlaps(msInterval(a.occupied), p))),
  );
  return busy ? "block_has_appointments" : null;
}
