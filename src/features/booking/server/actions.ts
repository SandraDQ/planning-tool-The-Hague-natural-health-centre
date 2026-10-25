"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getStore } from "@/lib/server/data";
import { getSession } from "@/lib/server/session";
import type { DomainErrorCode } from "@/lib/domain/store";
import type { Locale } from "@/lib/domain/types";
import { localDay, mondayOf } from "../time";
import { readDetails, validateDetails, type DetailsErrors, type DetailsValues } from "../validation";
import { clientArea } from "./client-area";
import { ownsBooking, rememberBooking } from "./ownership";
import { findSlotAt } from "./slots";

function errorCode(err: unknown): DomainErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? (code as DomainErrorCode) : null;
}

function asLocale(x: string): Locale {
  return (routing.locales as readonly string[]).includes(x) ? (x as Locale) : routing.defaultLocale;
}

function timeHref(sessionTypeId: string, startIso: string, extra: Record<string, string> = {}) {
  const day = localDay(startIso);
  return { pathname: "/book/time", query: { st: sessionTypeId, week: mondayOf(day), day, ...extra } };
}

export type HoldState =
  | { status: "idle" }
  | { status: "invalid"; errors: DetailsErrors; values: DetailsValues }
  | { status: "error"; values: DetailsValues };

/** Details form → hold the slot for 15 minutes → demo payment page. */
export async function holdBooking(_prev: HoldState, form: FormData): Promise<HoldState> {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const sessionTypeId = String(form.get("st") ?? "");
  const start = String(form.get("start") ?? "");
  const values = readDetails(form);
  const session = await getSession();
  const signedInClient = session?.role === "client";

  const errors = validateDetails(values, { askClientKind: !signedInClient, today: localDay(Date.now()) });
  if (Object.keys(errors).length > 0) return { status: "invalid", errors, values };

  const store = getStore();
  let newClient = values.clientKind === "new";
  if (signedInClient && session) {
    const mine = await clientArea(store).listMyAppointments?.(session).catch(() => []);
    newClient = !(mine ?? []).some((a) => a.status === "confirmed" || a.status === "completed");
  }

  let appointmentId: string;
  try {
    const slot = await findSlotAt(sessionTypeId, start);
    if (!slot) throw Object.assign(new Error("slot_taken"), { code: "slot_taken" });
    const appointment = await store.booking.holdSlot({
      sessionTypeId,
      slot,
      client: { firstName: values.firstName, lastName: values.lastName, email: values.email, phone: values.phone, locale },
      intake: {
        reason: values.reason,
        newClient,
        dateOfBirth: values.dateOfBirth || undefined,
        address: values.address || undefined,
        comments: values.comments || undefined,
        acceptedPolicy: true,
        healthDataConsent: true,
      },
    });
    appointmentId = appointment.id;
  } catch (err) {
    const code = errorCode(err);
    if (code === "slot_taken" || code === "block_taken" || code === "outside_block") {
      redirect({ href: timeHref(sessionTypeId, start, { taken: "1" }), locale });
    }
    console.error("[booking] hold failed", code ?? "unknown");
    return { status: "error", values };
  }

  await rememberBooking(appointmentId);
  redirect({ href: `/book/pay/${appointmentId}`, locale });
  return { status: "idle" };
}

async function ownedAppointment(id: string) {
  const appointment = await getStore().booking.getAppointment(id);
  if (!appointment || !(await ownsBooking(appointment))) return null;
  return appointment;
}

/** Demo stand-in for the Mollie webhook: the deposit was paid. */
export async function demoPaySucceeded(form: FormData) {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const id = String(form.get("id") ?? "");
  const appointment = await ownedAppointment(id);
  if (!appointment) redirect({ href: "/book", locale });
  let status: "ok" | "expired" | "error" = "ok";
  try {
    await getStore().booking.confirmPayment(id, `demo_${randomUUID()}`);
  } catch (err) {
    status = errorCode(err) === "hold_expired" ? "expired" : "error";
    if (status === "error") console.error("[booking] demo confirm failed", errorCode(err) ?? "unknown");
  }
  if (status !== "ok") redirect({ href: { pathname: `/book/pay/${id}`, query: { status } }, locale });
  redirect({ href: `/book/confirmed/${id}`, locale });
}

/** Demo: the bank declined the payment. */
export async function demoPayFailed(form: FormData) {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const id = String(form.get("id") ?? "");
  const appointment = await ownedAppointment(id);
  if (!appointment) redirect({ href: "/book", locale });
  try {
    await getStore().booking.failPayment(id);
  } catch (err) {
    console.error("[booking] demo fail failed", errorCode(err) ?? "unknown");
  }
  redirect({ href: { pathname: `/book/pay/${id}`, query: { status: "failed" } }, locale });
}

/** Demo: the client closed the bank page without paying. Nothing changes; the hold simply runs out. */
export async function demoPayAbandoned(form: FormData) {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const id = String(form.get("id") ?? "");
  redirect({ href: { pathname: `/book/pay/${id}`, query: { status: "abandoned" } }, locale });
}

export type CancelState = { status: "idle" | "done" | "error" | "unavailable" };

/** Client area: cancel one of my upcoming appointments. */
export async function cancelMyAppointment(_prev: CancelState, form: FormData): Promise<CancelState> {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const id = String(form.get("id") ?? "");
  const session = await getSession();
  if (!session || session.role !== "client") redirect({ href: "/login", locale });
  const cancel = clientArea(getStore()).cancelAppointment;
  if (!cancel) return { status: "unavailable" };
  try {
    await cancel(session!, id, "client");
  } catch (err) {
    console.error("[booking] client cancel failed", errorCode(err) ?? "unknown");
    return { status: "error" };
  }
  revalidatePath(`/${locale}/account`);
  return { status: "done" };
}
