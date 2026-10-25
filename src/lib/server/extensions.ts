// Store methods the MVP screens need that are not (yet) in the domain contract
// (src/lib/domain/store.ts). Proposed for the contract in handoffs/mvp-backend.md;
// the Supabase implementation must provide them too.

import type { AdminStore, DataStore, TherapistStore } from "@/lib/domain/store";
import type { Appointment, Client, Id, IntakeInput, PaperWindow, Session, SessionType, TimeOff } from "@/lib/domain/types";

/** Result of a client cancellation: what happens to the deposit. Cents. */
export interface ClientCancellation {
  appointment: Appointment;
  /** Cancelled before the policy's notice deadline (or exempt as a new client). */
  onTime: boolean;
  /** The policy deadline for free cancellation (ISO UTC); null when there is no policy. */
  freeUntil: string | null;
  /** Deposit that was paid online (0 for unpaid holds and manual bookings). */
  depositPaidCents: number;
  /** Part of the deposit the therapist keeps as cancellation fee. */
  feeCents: number;
  /** Part of the deposit that goes back to the client. */
  refundCents: number;
}

export interface TherapistExtras {
  /** All own session types, also those of archived services. */
  listMySessionTypes(session: Session): Promise<SessionType[]>;
  listMyTimeOff(session: Session): Promise<TimeOff[]>;
  /** Intake answers: only the treating therapist (never admin). null when none or purged. */
  readIntake(session: Session, appointmentId: Id): Promise<IntakeInput | null>;
  /** Own paper-calendar windows (open and filled). */
  listMyPaperWindows(session: Session): Promise<PaperWindow[]>;
}

export interface AdminExtras {
  listPaperWindows(session: Session): Promise<PaperWindow[]>;
}

/** Signed-in client ("/account"). */
export interface ClientStore {
  getMe(session: Session): Promise<Client>;
  /** Own appointments, newest first (no intake). */
  listMyAppointments(session: Session): Promise<Appointment[]>;
  /**
   * Cancel an own held/confirmed appointment before it starts, applying the therapist's
   * cancellation policy as it was at booking (D6): on time → full deposit back; late →
   * the fee is kept from the deposit, the rest is refunded; "no fee for new clients" respected.
   */
  cancelAppointment(session: Session, appointmentId: Id, by: "client"): Promise<ClientCancellation>;
}

export type AppStore = Omit<DataStore, "therapist" | "admin"> & {
  therapist: TherapistStore & TherapistExtras;
  admin: AdminStore & AdminExtras;
  client: ClientStore;
};
