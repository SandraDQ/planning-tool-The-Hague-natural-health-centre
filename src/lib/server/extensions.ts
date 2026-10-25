// Store methods the MVP screens need that are not (yet) in the domain contract
// (src/lib/domain/store.ts). Proposed for the contract in handoffs/mvp-backend.md;
// the Supabase implementation must provide them too.

import type { AdminStore, BookingStore, DataStore, TherapistStore } from "@/lib/domain/store";
import type {
  Appointment,
  BalancePayment,
  Client,
  Id,
  IntakeInput,
  Interval,
  Locale,
  PaperWindow,
  Room,
  RoomBlock,
  Session,
  SessionType,
  Slot,
  TimeOff,
} from "@/lib/domain/types";

/** Room-grid appointment for the admin: the client's first name only (7A), never intake. */
export type GridAppointment = Appointment & { clientFirstName: string | null };

/** Client details for a manual (phone/paper) booking: only the first name is required. */
export interface ManualClientInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  locale: Locale;
}

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

export interface BookingExtras {
  /**
   * Replaces the contract version (D26). Pass the viewer's session: a signed-in client
   * always books as themselves (typed details are ignored). Without a client session the
   * booking gets a new guest client record; it never attaches to an existing one by e-mail.
   */
  holdSlot(input: { sessionTypeId: Id; slot: Slot; client: Omit<Client, "id">; intake: IntakeInput; session?: Session | null }): Promise<Appointment>;
}

export interface TherapistExtras {
  /** Replaces the contract version: phone/paper clients need only a first name. */
  addManualBooking(session: Session, input: { sessionTypeId: Id; slot: Slot; client: ManualClientInput }): Promise<Appointment>;
  /** Balance payments of own appointments (others' ids are left out). */
  listBalancePayments(session: Session, appointmentIds: Id[]): Promise<BalancePayment[]>;
  /** Removes own time off. */
  deleteTimeOff(session: Session, timeOffId: Id): Promise<void>;
  /** All own session types, also those of archived services. */
  listMySessionTypes(session: Session): Promise<SessionType[]>;
  listMyTimeOff(session: Session): Promise<TimeOff[]>;
  /** Intake answers: only the treating therapist (never admin). null when none or purged. */
  readIntake(session: Session, appointmentId: Id): Promise<IntakeInput | null>;
  /** Own paper-calendar windows (open and filled). */
  listMyPaperWindows(session: Session): Promise<PaperWindow[]>;
}

export interface AdminExtras {
  /** Replaces the contract version: appointments carry `clientFirstName`. */
  roomGrid(session: Session, range: Interval): Promise<{ rooms: Room[]; blocks: RoomBlock[]; appointments: GridAppointment[] }>;
  /** All paper-calendar windows, optionally of one therapist, sorted by start. */
  listPaperWindows(session: Session, filter?: { therapistId?: Id }): Promise<PaperWindow[]>;
  /** Closes an open window so it takes no more bookings (a booked window is already closed to others). */
  closePaperWindow(session: Session, windowId: Id): Promise<PaperWindow>;
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

export type AppStore = Omit<DataStore, "booking" | "therapist" | "admin"> & {
  booking: Omit<BookingStore, "holdSlot"> & BookingExtras;
  therapist: Omit<TherapistStore, "addManualBooking"> & TherapistExtras;
  admin: Omit<AdminStore, "roomGrid"> & AdminExtras;
  client: ClientStore;
};
