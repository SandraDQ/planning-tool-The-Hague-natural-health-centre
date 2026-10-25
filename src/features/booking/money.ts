import type { Service, SessionType } from "@/lib/domain/types";

/**
 * Deposit for a session type, in cents, as shown before booking.
 * The store freezes the real figure in the appointment snapshot (D6); after a
 * hold, always show `appointment.snapshot.depositCents` instead.
 */
export function depositCents(service: Pick<Service, "depositType" | "depositValue">, st: Pick<SessionType, "priceCents">): number {
  const raw = service.depositType === "fixed" ? service.depositValue : Math.round((st.priceCents * service.depositValue) / 100);
  return Math.max(0, Math.min(raw, st.priceCents));
}

export type Money = { priceCents: number; depositCents: number; balanceCents: number };

export function money(priceCents: number, deposit: number): Money {
  return { priceCents, depositCents: deposit, balanceCents: Math.max(0, priceCents - deposit) };
}
