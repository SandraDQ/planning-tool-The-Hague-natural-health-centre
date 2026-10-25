// Time helpers for the demo store: thin wrappers over the scheduling engine's
// DST-safe Europe/Amsterdam helpers, plus ISO-interval versions of overlaps/contains.

import {
  addDays as engineAddDays,
  contains as msContains,
  datesBetween as engineDatesBetween,
  isoWeekday as engineIsoWeekday,
  localToUtc,
  overlaps as msOverlaps,
  utcToLocal,
} from "@/lib/scheduling";
import type { Interval, Iso } from "@/lib/domain/types";

export const MINUTE = 60_000;
export const DAY = 86_400_000;

export const ms = (iso: Iso) => Date.parse(iso);
export const iso = (t: number): Iso => new Date(t).toISOString();

const toMs = (i: Interval) => ({ start: ms(i.start), end: ms(i.end) });

/** Local date "YYYY-MM-DD" + local "HH:MM" in Amsterdam → ISO UTC. */
export const localToUtcIso = (date: string, time: string): Iso => localToUtc(date, time);
export const localToUtcMs = (date: string, time: string): number => ms(localToUtc(date, time));
/** Amsterdam calendar date of an instant. */
export const localDateOf = (t: number): string => utcToLocal(t).date;
export const isoWeekday = engineIsoWeekday;
export const addDays = engineAddDays;
export const datesBetween = engineDatesBetween;
export const mondayOf = (date: string): string => addDays(date, 1 - isoWeekday(date));

/** Half-open overlap test on ISO intervals. */
export const overlaps = (a: Interval, b: Interval): boolean => msOverlaps(toMs(a), toMs(b));
/** `inner` lies fully inside `outer`. */
export const contains = (outer: Interval, inner: Interval): boolean => msContains(toMs(outer), toMs(inner));

export function isValidInterval(i: Interval): boolean {
  const a = ms(i?.start);
  const b = ms(i?.end);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
