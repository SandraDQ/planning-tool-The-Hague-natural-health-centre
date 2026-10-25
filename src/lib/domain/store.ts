// The data-layer contract. UI and server actions talk only to this interface.
// Implementations: demo (in-memory, src/lib/server/demo/) now; Supabase later.
// Every method enforces the same rules as the database (no overlaps, blocks must
// contain shared-room appointments, admin never sees intake) and throws a DomainError.

import type {
  Appointment,
  AvailabilityRule,
  BalancePayment,
  BlockSeries,
  BlockTemplate,
  CancellationPolicy,
  Client,
  Id,
  IntakeInput,
  Interval,
  PaperWindow,
  RentRate,
  RentSettings,
  Room,
  RoomBlock,
  Service,
  Session,
  SessionType,
  Slot,
  Therapist,
  TherapistBusiness,
  Therapy,
  TimeOff,
} from "./types";

/** Codes match the database error codes (TH001–TH010) where one exists. */
export type DomainErrorCode =
  | "slot_taken"
  | "block_taken"
  | "outside_block"
  | "block_has_appointments"
  | "hold_expired"
  | "not_found"
  | "forbidden"
  | "invalid";

export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}

/** Public, anonymous reads for the website and booking flow. */
export interface PublicStore {
  listTherapies(): Promise<Therapy[]>;
  listBookableTherapists(filter?: { therapyId?: Id }): Promise<Therapist[]>;
  getTherapistBySlug(slug: string): Promise<Therapist | null>;
  listServices(therapistId: Id): Promise<Service[]>;
  listSessionTypes(serviceId: Id): Promise<SessionType[]>;
  getCancellationPolicy(therapistId: Id): Promise<CancellationPolicy | null>;
  /** Valid start slots for a session type in [from, to). Uses src/lib/scheduling. */
  findSlots(sessionTypeId: Id, range: Interval): Promise<Slot[]>;
}

/** Booking flow: hold, then confirm on (demo) payment. */
export interface BookingStore {
  /** Creates a held appointment (15 min). Throws slot_taken if gone. */
  holdSlot(input: {
    sessionTypeId: Id;
    slot: Slot;
    client: Omit<Client, "id">;
    intake: IntakeInput;
  }): Promise<Appointment>;
  /** Called by the (demo) payment webhook. Idempotent per paymentId. */
  confirmPayment(appointmentId: Id, paymentId: string): Promise<Appointment>;
  failPayment(appointmentId: Id): Promise<void>;
  getAppointment(id: Id): Promise<Appointment | null>;
}

export interface TherapistStore {
  getMe(session: Session): Promise<Therapist>;
  updateMe(session: Session, patch: Partial<Pick<Therapist, "bio" | "photoUrl" | "publicEmail" | "bufferMinutes" | "reminderHours" | "intakeRetentionDays">>): Promise<Therapist>;
  listMyAppointments(session: Session, range: Interval): Promise<Appointment[]>;
  listMyBlocks(session: Session, range: Interval): Promise<RoomBlock[]>;
  listClients(session: Session, ids: Id[]): Promise<Client[]>;
  reserveBlock(session: Session, input: { roomId: Id; blockTemplateId: Id; date: string; weekly?: boolean }): Promise<RoomBlock[]>;
  releaseBlock(session: Session, blockId: Id): Promise<void>;
  addManualBooking(session: Session, input: { sessionTypeId: Id; slot: Slot; client: Omit<Client, "id"> }): Promise<Appointment>;
  cancelAppointment(session: Session, appointmentId: Id, by: "therapist"): Promise<Appointment>;
  markNoShow(session: Session, appointmentId: Id): Promise<Appointment>;
  recordBalancePayment(session: Session, input: Omit<BalancePayment, "id">): Promise<BalancePayment>;
  listMyServices(session: Session): Promise<Service[]>;
  upsertService(session: Session, service: Omit<Service, "id" | "therapistId"> & { id?: Id }): Promise<Service>;
  upsertSessionType(session: Session, st: Omit<SessionType, "id"> & { id?: Id }): Promise<SessionType>;
  listAvailability(session: Session): Promise<AvailabilityRule[]>;
  setAvailability(session: Session, rules: Omit<AvailabilityRule, "id" | "therapistId">[]): Promise<AvailabilityRule[]>;
  addTimeOff(session: Session, period: Interval, note?: string): Promise<TimeOff>;
  getMyPolicy(session: Session): Promise<CancellationPolicy | null>;
  setMyPolicy(session: Session, policy: Omit<CancellationPolicy, "therapistId">): Promise<CancellationPolicy>;
  getMyBusiness(session: Session): Promise<TherapistBusiness | null>;
  /** Active rooms (no other therapists' details). */
  listRooms(session: Session): Promise<Room[]>;
  listBlockTemplates(session: Session): Promise<BlockTemplate[]>;
  /** Reserved shared-room blocks in range, anonymised: who holds them is hidden unless it is the caller. */
  listTakenBlocks(session: Session, range: Interval): Promise<Array<Pick<RoomBlock, "id" | "roomId" | "period"> & { mine: boolean }>>;
}

/** Admin: rooms, renters (therapists), rent configuration, overview. Never intake. */
export interface AdminStore {
  listRooms(session: Session): Promise<Room[]>;
  upsertRoom(session: Session, room: Omit<Room, "id"> & { id?: Id }): Promise<Room>;
  listBlockTemplates(session: Session): Promise<BlockTemplate[]>;
  upsertBlockTemplate(session: Session, t: Omit<BlockTemplate, "id"> & { id?: Id }): Promise<BlockTemplate>;
  listTherapists(session: Session): Promise<Therapist[]>;
  inviteTherapist(session: Session, input: { displayName: string; email: string; therapyIds: Id[] }): Promise<Therapist>;
  updateTherapist(session: Session, id: Id, patch: Partial<Pick<Therapist, "displayName" | "therapyIds" | "paperCalendar" | "bookable">>): Promise<Therapist>;
  getBusiness(session: Session, therapistId: Id): Promise<TherapistBusiness | null>;
  setBusiness(session: Session, business: TherapistBusiness): Promise<TherapistBusiness>;
  listTherapies(session: Session): Promise<Therapy[]>;
  upsertTherapy(session: Session, t: Omit<Therapy, "id"> & { id?: Id }): Promise<Therapy>;
  listRentRates(session: Session): Promise<RentRate[]>;
  upsertRentRate(session: Session, rate: Omit<RentRate, "id"> & { id?: Id }): Promise<RentRate>;
  getRentSettings(session: Session): Promise<RentSettings>;
  setRentSettings(session: Session, s: RentSettings): Promise<RentSettings>;
  /** Room grid: all blocks and appointments (no intake) in range. */
  roomGrid(session: Session, range: Interval): Promise<{ rooms: Room[]; blocks: RoomBlock[]; appointments: Appointment[] }>;
  listBlockSeries(session: Session): Promise<BlockSeries[]>;
  assignBlock(session: Session, input: { roomId: Id; therapistId: Id; blockTemplateId: Id; date: string; weekly?: boolean }): Promise<RoomBlock[]>;
  releaseBlock(session: Session, blockId: Id): Promise<void>;
  openPaperWindow(session: Session, input: Omit<PaperWindow, "id" | "status">): Promise<PaperWindow>;
}

export interface DataStore {
  public: PublicStore;
  booking: BookingStore;
  therapist: TherapistStore;
  admin: AdminStore;
}
