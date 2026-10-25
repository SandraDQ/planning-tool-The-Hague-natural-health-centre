import "server-only";
import { getStore } from "@/lib/server/data";
import type { Id, Slot } from "@/lib/domain/types";
import { addDays, localDay, localTime, startOfLocalDay } from "../time";

export type DaySlots = Record<string, { start: string; label: string }[]>;

/** Free start times between two local days [fromDay, toDay), grouped by local day, one entry per start time. */
export async function slotsByDay(sessionTypeId: Id, fromDay: string, toDay: string, now = Date.now()): Promise<DaySlots> {
  const slots = await getStore().public.findSlots(sessionTypeId, { start: startOfLocalDay(fromDay), end: startOfLocalDay(toDay) });
  const out: DaySlots = {};
  const seen = new Set<string>();
  for (const s of [...slots].sort((a, b) => a.session.start.localeCompare(b.session.start))) {
    const startMs = Date.parse(s.session.start);
    if (startMs <= now || seen.has(s.session.start)) continue;
    seen.add(s.session.start);
    const day = localDay(startMs);
    (out[day] ??= []).push({ start: new Date(startMs).toISOString(), label: localTime(s.session.start) });
  }
  return out;
}

/** The concrete slot (room, block) for a chosen start time, or null when it is no longer free. */
export async function findSlotAt(sessionTypeId: Id, startIso: string): Promise<Slot | null> {
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs) || startMs <= Date.now()) return null;
  const day = localDay(startMs);
  const slots = await getStore().public.findSlots(sessionTypeId, { start: startOfLocalDay(day), end: startOfLocalDay(addDays(day, 1)) });
  return slots.find((s) => Date.parse(s.session.start) === startMs) ?? null;
}
