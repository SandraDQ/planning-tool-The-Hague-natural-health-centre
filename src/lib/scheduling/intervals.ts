// Half-open [start, end) intervals in epoch ms, matching Postgres tstzrange '[)' and `&&`.
import type { Interval, Iso } from "@/lib/domain/types";

export const MINUTE_MS = 60_000;

export interface MsInterval {
  start: number;
  end: number;
}

export type Instant = Iso | Date | number;

export function toMs(t: Instant): number {
  return typeof t === "number" ? t : typeof t === "string" ? Date.parse(t) : t.getTime();
}

export const toIso = (ms: number): Iso => new Date(ms).toISOString();

export const msInterval = (i: Interval): MsInterval => ({ start: Date.parse(i.start), end: Date.parse(i.end) });

export const isoInterval = (i: MsInterval): Interval => ({ start: toIso(i.start), end: toIso(i.end) });

export const isValidInterval = (i: MsInterval) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.start < i.end;

/** True when the intervals share any time (touching ends do not overlap). */
export const overlaps = (a: MsInterval, b: MsInterval) => a.start < b.end && b.start < a.end;

/** outer @> inner */
export const contains = (outer: MsInterval, inner: MsInterval) => outer.start <= inner.start && inner.end <= outer.end;

/** Sort and merge overlapping or touching intervals. */
export function mergeIntervals(list: MsInterval[]): MsInterval[] {
  const sorted = list.filter(isValidInterval).sort((a, b) => a.start - b.start);
  const out: MsInterval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** base minus all cuts; returns the free pieces in order. */
export function subtractIntervals(base: MsInterval, cuts: MsInterval[]): MsInterval[] {
  let pieces: MsInterval[] = [base];
  for (const cut of mergeIntervals(cuts)) {
    const next: MsInterval[] = [];
    for (const p of pieces) {
      if (!overlaps(p, cut)) {
        next.push(p);
        continue;
      }
      if (p.start < cut.start) next.push({ start: p.start, end: cut.start });
      if (cut.end < p.end) next.push({ start: cut.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
}
