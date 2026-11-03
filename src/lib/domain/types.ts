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

export type BtwTreatment = "21" | "9" | "exempt";

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
  /**
   * BTW on this therapist's client invoices (admin sets it on the accountant's advice).
   * Prices clients see include BTW. Absent = exempt until the admin sets it.
   */
  btwTreatment?: BtwTreatment;
  /** Legal ground printed on invoices when exempt (e.g. "art. 11 lid 1 sub g Wet OB"). */
  exemptionGround?: string | null;
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

// ---------------------------------------------------------------- invoices --

export type InvoiceKind = "deposit" | "final" | "credit_note" | "room_rent";

/** Who an invoice is from or to, frozen at issue (D10: invoices never change afterwards). */
export interface InvoiceParty {
  name: string;
  address: string | null;
  email: string | null;
  kvk?: string | null;
  btwNumber?: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  /** Excl. BTW; negative on credit notes and deductions. */
  unitCents: number;
  lineTotalCents: number;
  btwTreatment: BtwTreatment;
  /** Basis points: 2100 = 21%. */
  btwRateBp: number;
  btwCents: number;
  exemptionGround: string | null;
}

/**
 * Client invoices (deposit, final, credit note) are in the therapist's name (9.1, 9.3);
 * room-rent invoices are from the centre to a therapist (9.4).
 */
export interface Invoice {
  id: Id;
  sellerType: "therapist" | "centre";
  sellerTherapistId: Id | null;
  kind: InvoiceKind;
  /** Drafts exist only for room rent (admin reviews before sending). */
  status: "draft" | "issued";
  /** "YYYY-NNNN", gap-free per seller per year (D13). Null while draft. */
  number: string | null;
  issuedAt: Iso | null;
  dueOn: string | null;
  locale: Locale;
  appointmentId: Id | null;
  creditedInvoiceId: Id | null;
  /** Room rent: first day of the month billed (YYYY-MM-01). */
  rentMonth: string | null;
  buyerClientId: Id | null;
  buyerTherapistId: Id | null;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  /** Plain-language lines printed under the totals (deposit received, balance paid, ...). */
  notes: string[];
  subtotalCents: number;
  btwCents: number;
  totalCents: number;
  /** Money received against this invoice. Not part of the frozen invoice. */
  paidCents: number;
  paidOn: string | null;
  /** When the invoice e-mail went out, and to whom. Null = not sent (yet). */
  sentAt: Iso | null;
  sentTo: string | null;
}

export type InvoicePaymentStatus = "draft" | "paid" | "open" | "overdue" | "credit";

// ------------------------------------------------------------ bookkeeping --
// The accounting tool in the portal (D40): the centre's own books (admin), and a
// therapist's books when the bookkeeping add-on is on. `ownerTherapistId` null = the centre.

/** What a cost was for. A short fixed list, so choosing is easy (D41). */
export type CostCategory =
  | "rent"
  | "supplies"
  | "equipment"
  | "office"
  | "phone_internet"
  | "software"
  | "marketing"
  | "training"
  | "travel"
  | "insurance"
  | "energy"
  | "cleaning"
  | "advice"
  | "bank_fees"
  | "other";

/** A receipt photo or PDF. The file itself is kept in storage, never in a list. */
export interface ReceiptFile {
  id: Id;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  bytes: number;
  uploadedAt: Iso;
}

/** One cost (purchase) with what was paid incl. BTW; net and BTW are derived from the rate. */
export interface Expense {
  id: Id;
  ownerTherapistId: Id | null;
  /** Date on the receipt (local). */
  date: string;
  supplier: string;
  description: string;
  category: CostCategory;
  grossCents: number;
  /** BTW rate on the receipt; "exempt" = no BTW on it. */
  btwRate: BtwTreatment;
  netCents: number;
  btwCents: number;
  receipt: ReceiptFile | null;
  /** The bank payment this cost was paid with, once linked. */
  bankTransactionId: Id | null;
  createdAt: Iso;
}

/** A read-only bank connection through a licensed provider (AISP). Never initiates payments. */
export interface BankConnection {
  ownerTherapistId: Id | null;
  bankName: string;
  /** Shown masked except the last 4 characters. */
  iban: string;
  holder: string;
  connectedAt: Iso;
  /** The bank's consent ends on this date; the owner renews it (every 90–180 days). */
  consentUntil: string;
  lastSyncAt: Iso;
  /** Demo feed: pretend transactions, no real bank. */
  demo: boolean;
}

/** What a bank payment was, once someone looked at it. */
export type BankMatch =
  | { kind: "invoice"; invoiceId: Id; balancePaymentId: Id | null }
  | { kind: "expense"; expenseId: Id }
  | { kind: "other_income" }
  | { kind: "counted" }
  | { kind: "private" };

export interface BankTransaction {
  id: Id;
  ownerTherapistId: Id | null;
  bookedOn: string;
  /** Positive = money in, negative = money out. */
  amountCents: number;
  counterparty: string;
  counterpartyIban: string | null;
  description: string;
  match: BankMatch | null;
}
