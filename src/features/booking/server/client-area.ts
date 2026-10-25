import "server-only";
import type { DataStore } from "@/lib/domain/store";
import type { Appointment, Client, Id, Session } from "@/lib/domain/types";

/**
 * What the client area needs from the data layer. The domain contract
 * (src/lib/domain/store.ts) has no client-facing store yet, so this is the
 * shape we ask the backend for (handoffs/mvp-booking-frontend.md). Until it
 * exists, the account page shows a friendly "coming soon" state.
 */
export interface ClientAreaStore {
  getMe(session: Session): Promise<Client>;
  listMyAppointments(session: Session): Promise<Appointment[]>;
  cancelAppointment(session: Session, appointmentId: Id, by: "client"): Promise<unknown>;
}

export function clientArea(store: DataStore): Partial<ClientAreaStore> {
  const candidate = (store as unknown as { client?: Partial<ClientAreaStore> }).client;
  if (!candidate) return {};
  return {
    getMe: typeof candidate.getMe === "function" ? candidate.getMe.bind(candidate) : undefined,
    listMyAppointments:
      typeof candidate.listMyAppointments === "function" ? candidate.listMyAppointments.bind(candidate) : undefined,
    cancelAppointment:
      typeof candidate.cancelAppointment === "function" ? candidate.cancelAppointment.bind(candidate) : undefined,
  };
}
