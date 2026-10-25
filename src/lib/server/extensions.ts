// Store methods the MVP screens need that are not (yet) in the domain contract
// (src/lib/domain/store.ts). Proposed for the contract in handoffs/mvp-backend.md;
// the Supabase implementation must provide them too.

import type { AdminStore, DataStore, TherapistStore } from "@/lib/domain/store";
import type { Appointment, Client, Id, IntakeInput, PaperWindow, Session, SessionType, TimeOff } from "@/lib/domain/types";

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
}

export type AppStore = Omit<DataStore, "therapist" | "admin"> & {
  therapist: TherapistStore & TherapistExtras;
  admin: AdminStore & AdminExtras;
  client: ClientStore;
};
