// Domain types shared by the data layer, scheduling engine and UI.
// Mirrors supabase/migrations (PLAN.md section 3). Times are ISO 8601 UTC strings;
// money is integer cents; durations are minutes.

export type Id = string;
export type Iso = string;
export type Locale = "nl" | "en";
export type Role = "admin" | "therapist" | "client";

export interface Interval {
  start: Iso;
  end: Iso;
}

export interface Session {
  role: Role;
  userId: Id;
  /** Set when role is "therapist". */
  therapistId?: Id;
  /** Set when role is "client". */
  clientId?: Id;
  displayName: string;
}

export interface Therapy {
  id: Id;
  name: Record<Locale, string>;
  active: boolean;
}

export type RoomKind = "private" | "shared";

export interface Room {
  id: Id;
  number: number;
  name: string;
  kind: RoomKind;
  active: boolean;
  /** Private rooms only. */
  privateTherapistId: Id | null;
}

/** Fixed block times for shared rooms, local time "HH:MM". */
export interface BlockTemplate {
  id: Id;
  startTime: string;
  endTime: string;
  active: boolean;
}

export type RentPricingMode = "fixed_monthly" | "per_block";

export interface RentRate {
  id: Id;
  /** null = default per-block rate for shared rooms. */
  roomId: Id | null;
  pricingMode: RentPricingMode;
  amountCents: number;
  btwTreatment: "21" | "9" | "exempt";
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
}

export interface RentSettings {
  billingDay: number;
  paymentTermDays: number;
  autoSend: boolean;
}

export type OnboardingStatus = "invited" | "in_progress" | "complete";

export interface Therapist {
  id: Id;
  slug: string;
  displayName: string;
  bio: Record<Locale, string>;
  photoUrl: string | null;
  publicEmail: string | null;
  therapyIds: Id[];
  bookable: boolean;
  paperCalendar: boolean;
  bufferMinutes: number;
  reminderHours: number;
  intakeRetentionDays: number | null; // null = until manually deleted
  onboardingStatus: OnboardingStatus;
}

/** Entered by admin; read-only for the therapist. */
export interface TherapistBusiness {
  therapistId: Id;
  legalName: string;
  tradeName: string | null;
  address: string | null;
  kvk: string | null;
  btwNumber: string | null;
  kor: boolean;
}

export interface Service {
  id: Id;
  therapistId: Id;
  therapyId: Id;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  depositType: "fixed" | "percent";
  /** Cents when fixed, whole percent when percent. */
  depositValue: number;
  archived: boolean;
}

export interface SessionType {
  id: Id;
  serviceId: Id;
  name: Record<Locale, string>;
  durationMin: number;
  priceCents: number;
}

export interface CancellationPolicy {
  therapistId: Id;
  noticeValue: number;
  noticeUnit: "hours" | "business_days";
  feeType: "fixed" | "percent";
  feeValue: number;
  exemptNewClients: boolean;
  text: Record<Locale, string>;
}

/** Weekly working hours (private-room therapists), local time. */
export interface AvailabilityRule {
  id: Id;
  therapistId: Id;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO weekday, Monday = 1
  startTime: string;
  endTime: string;
}

export interface TimeOff {
  id: Id;
  therapistId: Id;
  period: Interval;
  note: string | null;
}

export type BlockStatus = "reserved" | "released";

/** One concrete reserved block in a shared room. */
export interface RoomBlock {
  id: Id;
  roomId: Id;
  therapistId: Id;
  period: Interval;
  seriesId: Id | null;
  status: BlockStatus;
}

/** Weekly recurring reservation that generates RoomBlocks. */
export interface BlockSeries {
  id: Id;
  roomId: Id;
  therapistId: Id;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  blockTemplateId: Id;
  startsOn: string; // YYYY-MM-DD
  endsOn: string | null;
}

export interface PaperWindow {
  id: Id;
  therapistId: Id;
  roomId: Id;
  period: Interval;
  status: "open" | "filled" | "closed";
}

export interface Client {
  id: Id;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locale: Locale;
}

export type AppointmentStatus = "held" | "confirmed" | "cancelled" | "no_show" | "completed";

export interface Appointment {
  id: Id;
  therapistId: Id;
  roomId: Id;
  roomBlockId: Id | null;
  /** Set when booked into an admin-opened paper-calendar window (3.5). */
  paperWindowId?: Id | null;
  clientId: Id;
  sessionTypeId: Id;
  /** Session only. */
  session: Interval;
  /** Session plus the therapist's buffer; this is what may not overlap. */
  occupied: Interval;
  status: AppointmentStatus;
  holdExpiresAt: Iso | null;
  source: "online" | "manual";
  /** Terms frozen at booking (D6). */
  snapshot: {
    serviceName: Record<Locale, string>;
    sessionTypeName: Record<Locale, string>;
    durationMin: number;
    priceCents: number;
    depositCents: number;
    bufferMinutes: number;
  };
}

export interface IntakeInput {
  reason: string;
  newClient: boolean;
  dateOfBirth?: string;
  address?: string;
  comments?: string;
  extraAnswers?: Record<string, string>;
  acceptedPolicy: true;
  healthDataConsent: true;
}

export interface BalancePayment {
  id: Id;
  appointmentId: Id;
  method: "cash" | "pin" | "transfer" | "tikkie";
  amountCents: number;
  paidOn: string; // YYYY-MM-DD
}

export interface Slot {
  therapistId: Id;
  roomId: Id;
  roomBlockId: Id | null;
  paperWindowId?: Id | null;
  session: Interval;
}
