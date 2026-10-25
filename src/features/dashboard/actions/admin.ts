"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import type { BlockTemplate, Id, Interval, RentRate, RentSettings, Room, Therapist, TherapistBusiness, Therapy } from "@/lib/domain/types";
import { run } from "./run";
import { addDays } from "../time";

async function admin() {
  const session = await requireRole("admin", await getLocale());
  return { session, store: getStore().admin };
}

function done() {
  revalidatePath("/[locale]/admin", "layout");
}

export async function saveRoom(room: Omit<Room, "id"> & { id?: Id }) {
  const { session, store } = await admin();
  const result = await run(() => store.upsertRoom(session, room));
  done();
  return result;
}

export async function saveBlockTemplate(template: Omit<BlockTemplate, "id"> & { id?: Id }) {
  const { session, store } = await admin();
  const result = await run(() => store.upsertBlockTemplate(session, template));
  done();
  return result;
}

export async function inviteRenter(input: { displayName: string; email: string; therapyIds: Id[] }) {
  const { session, store } = await admin();
  const result = await run(() => store.inviteTherapist(session, input));
  done();
  return result;
}

export async function updateRenter(id: Id, patch: Partial<Pick<Therapist, "displayName" | "therapyIds" | "paperCalendar" | "bookable">>) {
  const { session, store } = await admin();
  const result = await run(() => store.updateTherapist(session, id, patch));
  done();
  return result;
}

export async function saveBusiness(business: TherapistBusiness) {
  const { session, store } = await admin();
  const result = await run(() => store.setBusiness(session, business));
  done();
  return result;
}

export async function saveTherapy(therapy: Omit<Therapy, "id"> & { id?: Id }) {
  const { session, store } = await admin();
  const result = await run(() => store.upsertTherapy(session, therapy));
  done();
  return result;
}

export async function saveRentRate(rate: Omit<RentRate, "id"> & { id?: Id }) {
  const { session, store } = await admin();
  const result = await run(() => store.upsertRentRate(session, rate));
  done();
  return result;
}

export async function saveRentSettings(settings: RentSettings) {
  const { session, store } = await admin();
  const result = await run(() => store.setRentSettings(session, settings));
  done();
  return result;
}

export async function assignBlock(input: { roomId: Id; therapistId: Id; blockTemplateId: Id; date: string; weekly?: boolean }) {
  const { session, store } = await admin();
  const result = await run(() => store.assignBlock(session, input));
  done();
  return result;
}

export async function releaseBlockAsAdmin(blockId: Id) {
  const { session, store } = await admin();
  const result = await run(() => store.releaseBlock(session, blockId).then(() => null));
  done();
  return result;
}

/**
 * Sets a room's price from a date (D12). Rates may not overlap per room, so the rate
 * running at that date is closed the day before, and the new one runs until the next
 * planned change (if any). Same start date = edit that rate.
 */
export async function changeRentRate(input: Omit<RentRate, "id" | "validTo">) {
  const { session, store } = await admin();
  const result = await run(async () => {
    const rates = (await store.listRentRates(session)).filter((r) => r.roomId === input.roomId);
    const same = rates.find((r) => r.validFrom === input.validFrom);
    if (same) return store.upsertRentRate(session, { ...same, ...input });
    const running = rates.find((r) => r.validFrom < input.validFrom && (r.validTo == null || r.validTo >= input.validFrom));
    const next = rates.filter((r) => r.validFrom > input.validFrom).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
    if (running) await store.upsertRentRate(session, { ...running, validTo: addDays(input.validFrom, -1) });
    return store.upsertRentRate(session, { ...input, validTo: next ? addDays(next.validFrom, -1) : null });
  });
  done();
  return result;
}

export async function openPaperWindow(input: { therapistId: Id; roomId: Id; period: Interval }) {
  const { session, store } = await admin();
  const result = await run(() => store.openPaperWindow(session, input));
  done();
  return result;
}

export async function closePaperWindow(windowId: Id) {
  const { session, store } = await admin();
  const result = await run(() => store.closePaperWindow(session, windowId));
  done();
  return result;
}
