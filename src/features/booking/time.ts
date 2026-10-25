// Time helpers for the booking UI. All local times are Europe/Amsterdam;
// the store speaks ISO 8601 UTC. Pure functions, safe on server and client.

export const TIME_ZONE = "Europe/Amsterdam";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function local(ms: number) {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = x.value;
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** Amsterdam calendar day "YYYY-MM-DD" of an ISO instant. */
export function localDay(iso: string | number): string {
  const p = local(typeof iso === "number" ? iso : Date.parse(iso));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Amsterdam wall-clock time "HH:mm" of an ISO instant. */
export function localTime(iso: string): string {
  const p = local(Date.parse(iso));
  return `${p.hour}:${p.minute}`;
}

function offsetAt(ms: number) {
  const p = local(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC ISO instant of Amsterdam midnight at the start of `day` (DST-safe). */
export function startOfLocalDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return new Date(ms).toISOString();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((wd + 6) % 7));
}

export function isDay(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Monday to Sunday of the week starting `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
