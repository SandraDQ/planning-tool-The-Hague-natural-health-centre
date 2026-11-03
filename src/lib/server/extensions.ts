// Store methods the MVP screens need that are not (yet) in the domain contract
// (src/lib/domain/store.ts). Proposed for the contract in handoffs/mvp-backend.md;
// the Supabase implementation must provide them too.

import type { AdminStore, BookingStore, DataStore, TherapistStore } from "@/lib/domain/store";
import type { FeedEvent } from "./calendar-feed/ics";
import type { FeedSubject } from "./calendar-feed/token";
import type {
  Appointment,
  CancellationPolicy,
  BalancePayment,
  CentreEmailSettings,
  Client,
  EmailTemplate,
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
  /**
   * Server only, after verifying a signed "manage" link from the confirmation e-mail
   * (src/lib/email/manage-link.ts): cancel as the client, with the same policy rules.
   */
  cancelWithLink(appointmentId: Id): Promise<ClientCancellation>;
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

/** Everything the booking confirmation e-mail needs (read with server rights, never shown raw). */
export interface BookingEmailFacts {
  appointment: Appointment;
  client: Pick<Client, "firstName" | "email" | "locale">;
  therapist: { displayName: string; publicEmail: string | null; loginEmail: string | null };
  roomNumber: number | null;
  /** Personal message for this treatment, or the therapist's general one; null = none written. */
  template: EmailTemplate | null;
  centre: CentreEmailSettings;
  /** Policy frozen at booking (D6). */
  policy: CancellationPolicy | null;
  depositPaidCents: number;
}

/** Confirmation e-mail texts: therapists write their own message, the admin the centre info. */
export interface EmailStore {
  /** Own messages: the general one (serviceId null) and any per-treatment ones. */
  listMyTemplates(session: Session): Promise<EmailTemplate[]>;
  /** Saves own message. serviceId must be an own service, or null for all treatments. */
  setMyTemplate(session: Session, input: { serviceId: Id | null; body: Record<Locale, string> }): Promise<EmailTemplate>;
  /** Removes an own per-treatment message (that treatment then uses the general one). */
  deleteMyTemplate(session: Session, serviceId: Id): Promise<void>;
  /** Admin and therapists (for the preview). */
  getCentreSettings(session: Session): Promise<CentreEmailSettings>;
  setCentreSettings(session: Session, settings: CentreEmailSettings): Promise<CentreEmailSettings>;
  /** Server only (payment webhook / booking flow): facts for one appointment's confirmation. */
  bookingEmailFacts(appointmentId: Id): Promise<BookingEmailFacts | null>;
}

/**
 * One-way calendar feed (7A). The signed link is the credential for `versionFor` and
 * `events`; the signed-in therapist or admin reads and resets their own link.
 */
export interface FeedStore {
  /** Current link version of a feed; 0 until the link is first reset. */
  versionFor(subject: FeedSubject): Promise<number>;
  /** Events for the feed, in [from, to). First name and service only, never intake (7A). */
  events(subject: FeedSubject, range: Interval, locale: Locale): Promise<FeedEvent[]>;
  /** The viewer's own feed (therapist: their calendar; admin: all room blocks). */
  mine(session: Session): Promise<{ subject: FeedSubject; version: number }>;
  /** Makes the old link stop working; returns the new version. */
  resetMine(session: Session): Promise<number>;
}

export type AppStore = Omit<DataStore, "booking" | "therapist" | "admin"> & {
  booking: Omit<BookingStore, "holdSlot"> & BookingExtras;
  therapist: Omit<TherapistStore, "addManualBooking"> & TherapistExtras;
  admin: Omit<AdminStore, "roomGrid"> & AdminExtras;
  client: ClientStore;
  email: EmailStore;
  feeds: FeedStore;
};
