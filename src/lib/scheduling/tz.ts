// Europe/Amsterdam wall-time helpers built on Intl (no dependencies).
// Domain times are ISO UTC; rules, templates and grids are local wall time.
//
// Conversion rules (same as Postgres `timestamp AT TIME ZONE` and Temporal "compatible"):
//  * a local time that does not exist (spring gap 02:00-03:00) moves forward by the gap,
//    e.g. 02:30 -> 03:30 CEST;
//  * an ambiguous local time (autumn 02:00-03:00 happens twice) takes the first one (CEST).

export const CENTRE_TIME_ZONE = "Europe/Amsterdam";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallParts(utcMs: number, timeZone: string) {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second };
}

/** Offset of local time from UTC in minutes at an instant (Amsterdam: 60 or 120). */
export function tzOffsetMinutes(utcMs: number, timeZone = CENTRE_TIME_ZONE): number {
  const w = wallParts(utcMs, timeZone);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / MINUTE);
}

const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "HH:MM" -> minutes after midnight (0..1440; "24:00" allowed as end of day). */
export function parseTime(hhmm: string): number {
  const m = TIME_RE.exec(hhmm);
  if (!m) throw new RangeError(`invalid time "${hhmm}"`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes > 1440) throw new RangeError(`invalid time "${hhmm}"`);
  return minutes;
}

function parseDate(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`invalid date "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateFromUtcMidnight = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const dateMs = (date: string) => {
  const [y, mo, d] = parseDate(date);
  return Date.UTC(y, mo - 1, d);
};

/** Calendar arithmetic on "YYYY-MM-DD" (no time zone involved). */
export function addDays(date: string, days: number): string {
  return dateFromUtcMidnight(dateMs(date) + days * DAY);
}

/** ISO weekday of a calendar date, Monday = 1 ... Sunday = 7. */
export function isoWeekday(date: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const wd = new Date(dateMs(date)).getUTCDay();
  return (wd === 0 ? 7 : wd) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** Inclusive list of calendar dates from..to. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = dateMs(from), end = dateMs(to); ms <= end; ms += DAY) out.push(dateFromUtcMidnight(ms));
  return out;
}

/** Local date + minutes after local midnight -> UTC epoch ms. */
export function localToUtcMs(date: string, minutes: number, timeZone = CENTRE_TIME_ZONE): number {
  const wallMs = dateMs(date) + minutes * MINUTE; // the wall clock read as if it were UTC
  const before = tzOffsetMinutes(wallMs - DAY, timeZone);
  const after = tzOffsetMinutes(wallMs + DAY, timeZone);
  const valid = [before, after]
    .map((off) => wallMs - off * MINUTE)
    .filter((utc) => wallMs - tzOffsetMinutes(utc, timeZone) * MINUTE === utc);
  if (valid.length > 0) return Math.min(...valid); // ambiguous -> first occurrence
  return wallMs - before * MINUTE; // gap -> shift forward by the gap
}

/** Local date + "HH:MM" -> ISO UTC string. */
export function localToUtc(date: string, time: string, timeZone = CENTRE_TIME_ZONE): string {
  return new Date(localToUtcMs(date, parseTime(time), timeZone)).toISOString();
}

export interface LocalDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Minutes after local midnight. */
  minuteOfDay: number;
  offsetMinutes: number;
}

/** ISO UTC (or epoch ms / Date) -> local wall time parts. */
export function utcToLocal(at: string | number | Date, timeZone = CENTRE_TIME_ZONE): LocalDateTime {
  const ms = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : at.getTime();
  const w = wallParts(ms, timeZone);
  const date = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
  return {
    date,
    time: `${pad(w.h)}:${pad(w.mi)}`,
    weekday: isoWeekday(date),
    minuteOfDay: w.h * 60 + w.mi,
    offsetMinutes: tzOffsetMinutes(ms, timeZone),
  };
}
