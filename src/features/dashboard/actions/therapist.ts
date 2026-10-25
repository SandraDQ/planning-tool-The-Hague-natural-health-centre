"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import type {
  AvailabilityRule,
  BalancePayment,
  CancellationPolicy,
  Client,
  Id,
  Interval,
  Service,
  SessionType,
  Slot,
  Therapist,
} from "@/lib/domain/types";
import { run } from "./run";
import { dayRange } from "../time";

async function therapist() {
  const session = await requireRole("therapist", await getLocale());
  return { session, store: getStore() };
}

function done() {
  revalidatePath("/[locale]/therapist", "layout");
}

export async function reserveBlock(input: { roomId: Id; blockTemplateId: Id; date: string; weekly?: boolean }) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.reserveBlock(session, input));
  done();
  return result;
}

export async function releaseBlock(blockId: Id) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.releaseBlock(session, blockId).then(() => null));
  done();
  return result;
}

/** Valid start times for a manual booking on one day (same engine as online booking). */
export async function manualSlots(sessionTypeId: Id, day: string) {
  const { session, store } = await therapist();
  return run(async () => {
    const slots = await store.public.findSlots(sessionTypeId, dayRange(day));
    return slots.filter((s) => s.therapistId === session.therapistId);
  });
}

export async function addManualBooking(input: { sessionTypeId: Id; slot: Slot; client: Omit<Client, "id"> }) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.addManualBooking(session, input));
  done();
  return result;
}

export async function cancelAppointment(appointmentId: Id) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.cancelAppointment(session, appointmentId, "therapist"));
  done();
  return result;
}

export async function markNoShow(appointmentId: Id) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.markNoShow(session, appointmentId));
  done();
  return result;
}

export async function recordBalancePayment(input: Omit<BalancePayment, "id">) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.recordBalancePayment(session, input));
  done();
  return result;
}

export async function updateProfile(
  patch: Partial<Pick<Therapist, "bio" | "publicEmail" | "bufferMinutes" | "reminderHours" | "intakeRetentionDays">>,
) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.updateMe(session, patch));
  done();
  return result;
}

export async function saveService(service: Omit<Service, "id" | "therapistId"> & { id?: Id }) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.upsertService(session, service));
  done();
  return result;
}

export async function saveSessionType(sessionType: Omit<SessionType, "id"> & { id?: Id }) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.upsertSessionType(session, sessionType));
  done();
  return result;
}

export async function saveAvailability(rules: Omit<AvailabilityRule, "id" | "therapistId">[]) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.setAvailability(session, rules));
  done();
  return result;
}

export async function addTimeOff(period: Interval, note?: string) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.addTimeOff(session, period, note));
  done();
  return result;
}

export async function savePolicy(policy: Omit<CancellationPolicy, "therapistId">) {
  const { session, store } = await therapist();
  const result = await run(() => store.therapist.setMyPolicy(session, policy));
  done();
  return result;
}
