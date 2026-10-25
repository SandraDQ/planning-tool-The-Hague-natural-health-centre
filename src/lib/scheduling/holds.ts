// Checkout holds (D5): a held appointment blocks its time for 15 minutes.
import type { Appointment, Iso } from "@/lib/domain/types";
import type { DomainErrorCode } from "@/lib/domain/store";
import { type Instant, MINUTE_MS, toIso, toMs } from "./intervals";

export const HOLD_MINUTES = 15;

/** hold_expires_at for a hold created at `now`. */
export function holdExpiresAt(now: Instant, minutes = HOLD_MINUTES): Iso {
  return toIso(toMs(now) + minutes * MINUTE_MS);
}

/** A held appointment whose hold time has passed (expiry instant itself counts as expired). */
export function isHoldExpired(appointment: Pick<Appointment, "status" | "holdExpiresAt">, now: Instant): boolean {
  if (appointment.status !== "held" || appointment.holdExpiresAt == null) return false;
  return Date.parse(appointment.holdExpiresAt) <= toMs(now);
}

/**
 * Does this appointment occupy its time? Confirmed always; held only while the hold is live.
 * Without `now`, every hold counts (the conservative database view).
 */
export function isActiveAppointment(appointment: Pick<Appointment, "status" | "holdExpiresAt">, now?: Instant): boolean {
  if (appointment.status === "confirmed") return true;
  if (appointment.status !== "held") return false;
  return now === undefined || !isHoldExpired(appointment, now);
}

/**
 * Payment webhook arrived: may the hold become confirmed?
 * null = yes (or already confirmed: idempotent); hold_expired = too late, refund the payment.
 */
export function canConfirmHold(appointment: Pick<Appointment, "status" | "holdExpiresAt">, now: Instant): DomainErrorCode | null {
  if (appointment.status === "confirmed") return null;
  if (appointment.status !== "held" || isHoldExpired(appointment, now)) return "hold_expired";
  return null;
}
