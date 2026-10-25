// Date/time helpers for the dashboards. Pure, safe on server and client.
// Local times are Europe/Amsterdam; the store speaks UTC ISO strings.
// TODO(scheduling): switch to the zone helpers in src/lib/scheduling once they are exported.

import type { Interval, Iso } from "@/lib/domain/types";

export const TIME_ZONE = "Europe/Amsterdam";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const pad = (n: number) => String(n).padStart(2, "0");

function localParts(ms: number) {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function offsetAt(ms: number) {
  const p = localParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Local date + "HH:MM" in Amsterdam → UTC ISO (DST-safe). */
export function localToIso(day: string, time: string): Iso {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return new Date(ms).toISOString();
}

/** Local calendar day "YYYY-MM-DD" of an instant. */
export function localDay(iso: Iso | number): string {
  const p = localParts(typeof iso === "number" ? iso : Date.parse(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local "HH:MM" of an instant. */
export function localTime(iso: Iso): string {
  const p = localParts(Date.parse(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since local midnight. */
export function localMinutes(iso: Iso): number {
  const p = localParts(Date.parse(iso));
  return p.hour * 60 + p.minute;
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function todayLocal(): string {
  return localDay(Date.now());
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** ISO weekday, Monday = 1. */
export function isoWeekday(day: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (wd === 0 ? 7 : wd) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** ISO week number of a local date. */
export function isoWeekNumber(day: string): number {
  const thursday = addDays(day, 4 - isoWeekday(day));
  const [y] = thursday.split("-").map(Number);
  const jan1 = Date.UTC(y, 0, 1);
  const [ty, tm, td] = thursday.split("-").map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - jan1) / 86_400_000 / 7) + 1;
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** [Monday 00:00, next Monday 00:00) local, as UTC. */
export function weekRange(monday: string): Interval {
  return { start: localToIso(monday, "00:00"), end: localToIso(addDays(monday, 7), "00:00") };
}

export function dayRange(day: string): Interval {
  return { start: localToIso(day, "00:00"), end: localToIso(addDays(day, 1), "00:00") };
}

/** First day of the month of a local date, and [1st, 1st of next month). */
export function monthRange(day: string): Interval & { first: string; next: string } {
  const [y, m] = day.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { first, next, start: localToIso(first, "00:00"), end: localToIso(next, "00:00") };
}

/** Accept only a well-formed "YYYY-MM-DD" from a search param. */
export function parseDayParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null;
}

export function overlaps(a: Interval, b: Interval) {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function minutesBetween(a: Iso, b: Iso) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
}
