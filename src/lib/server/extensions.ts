// Store methods the MVP screens need that are not (yet) in the domain contract
// (src/lib/domain/store.ts). Proposed for the contract in handoffs/mvp-backend.md;
// the Supabase implementation must provide them too.

import type { AdminStore, BookingStore, DataStore, TherapistStore } from "@/lib/domain/store";
import type { MatchSuggestion } from "@/lib/books/matching";
import type { FeedEvent } from "./calendar-feed/ics";
import type { FeedSubject } from "./calendar-feed/token";
import type {
  Appointment,
  BalancePayment,
  BankConnection,
  BankTransaction,
  BtwTreatment,
  CostCategory,
  Expense,
  Client,
  Id,
  IntakeInput,
  Interval,
  Invoice,
  Locale,
  PaperWindow,
  ReceiptFile,
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

/** A session that has started and is not fully paid: the "who still has to pay" list. Cents incl. BTW. */
export interface OutstandingSession {
  appointment: Appointment;
  clientName: string;
  clientEmail: string | null;
  priceCents: number;
  depositPaidCents: number;
  balancePaidCents: number;
  dueCents: number;
  /** The final invoice, once sent. */
  finalInvoice: Invoice | null;
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
  /** Issued invoices in the therapist's name (to clients), newest first. Optional local-date range [from, to). */
  listMyInvoices(session: Session, filter?: { from?: string; to?: string }): Promise<Invoice[]>;
  /** Invoices of own appointments (deposit, final, credit notes). */
  listAppointmentInvoices(session: Session, appointmentIds: Id[]): Promise<Invoice[]>;
  /** Room-rent invoices the centre sent to this therapist, newest first. */
  listMyRentInvoices(session: Session): Promise<Invoice[]>;
  /** Sessions that have started and still have money to come in, oldest first. */
  listOutstanding(session: Session): Promise<OutstandingSession[]>;
  /** Issues (and queues for e-mail) the final invoice before the balance is paid. Idempotent. */
  sendFinalInvoice(session: Session, appointmentId: Id): Promise<Invoice>;
}

export interface AdminExtras {
  /** Replaces the contract version: appointments carry `clientFirstName`. */
  roomGrid(session: Session, range: Interval): Promise<{ rooms: Room[]; blocks: RoomBlock[]; appointments: GridAppointment[] }>;
  /** All paper-calendar windows, optionally of one therapist, sorted by start. */
  listPaperWindows(session: Session, filter?: { therapistId?: Id }): Promise<PaperWindow[]>;
  /** Closes an open window so it takes no more bookings (a booked window is already closed to others). */
  closePaperWindow(session: Session, windowId: Id): Promise<PaperWindow>;
  /** Room-rent invoices (drafts and issued), of one month (any day in it) or all, newest first. Never client invoices. */
  listRentInvoices(session: Session, month?: string): Promise<Invoice[]>;
  /** Builds the draft rent invoices of a month for review (replaces earlier drafts). */
  prepareRentInvoices(session: Session, month: string): Promise<Invoice[]>;
  /** Sends (issues) draft rent invoices: number, date and due date are set; e-mail follows. */
  sendRentInvoices(session: Session, invoiceIds: Id[]): Promise<Invoice[]>;
  /** Marks an issued rent invoice paid on a date, or unpaid again (null). */
  setRentInvoicePaid(session: Session, invoiceId: Id, paidOn: string | null): Promise<Invoice>;
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
  /** Own invoices (deposit, final, credit notes), newest first. */
  listMyInvoices(session: Session): Promise<Invoice[]>;
}

/** Reading one invoice (PDF download) and the e-mail outbox for invoices. */
export interface InvoiceAccess {
  /**
   * One issued invoice, if the viewer may see it: the client it is addressed to, the
   * therapist who issued it or received it (rent), the admin for room rent only.
   * Anything else → not_found (no hint that the invoice exists).
   */
  getForViewer(session: Session, invoiceId: Id): Promise<Invoice>;
  /** Server only (no session): issued invoices with an e-mail address that were not sent yet. */
  listUnsent(): Promise<Invoice[]>;
  /** Server only: stamps an invoice as e-mailed. */
  markSent(invoiceId: Id, to: string, at: string): Promise<void>;
}

/** Whether a viewer can use the bookkeeping pages. Admin: always "on" (the centre's books). */
export interface BooksAccess {
  status: "on" | "off" | "requested" | "needs_terms";
  /** Monthly add-on fee excl. BTW, put on the rent invoice (therapists only). */
  feeCents: number;
}

/** Everything one owner's bookkeeping pages show. */
export interface BooksData {
  ownerName: string;
  /** False when the owner uses the KOR or only has BTW-exempt sales: BTW on costs does not come back. */
  deductsBtw: boolean;
  btwNote: "kor" | "exempt" | null;
  /** Issued sales invoices (centre: room rent; therapist: own client invoices). */
  invoices: Invoice[];
  expenses: Expense[];
  /** Newest first. */
  transactions: BankTransaction[];
  connection: BankConnection | null;
  /** For every transaction nobody looked at yet. */
  suggestions: Record<Id, MatchSuggestion>;
}

export interface ExpenseInput {
  date: string;
  supplier: string;
  description?: string;
  category: CostCategory;
  grossCents: number;
  btwRate: BtwTreatment;
}

export type BankMatchInput =
  | { kind: "invoice"; invoiceId: Id }
  | { kind: "expense"; expenseId: Id }
  | { kind: "new_expense"; expense: ExpenseInput }
  | { kind: "other_income" }
  | { kind: "counted" }
  | { kind: "private" };

/** The accounting tool (D40): the admin keeps the centre's books, a therapist their own (add-on). */
export interface BooksStore {
  access(session: Session): Promise<BooksAccess>;
  /** Therapist asks the centre to switch the add-on on. */
  requestAddon(session: Session): Promise<BooksAccess>;
  /** Therapist agrees to the processing terms before first use (D45). */
  acceptTerms(session: Session): Promise<BooksAccess>;
  getBooks(session: Session): Promise<BooksData>;
  saveExpense(session: Session, input: ExpenseInput & { id?: Id }): Promise<Expense>;
  /** Deletes a cost and its receipt; a linked bank payment goes back to "needs a look". */
  deleteExpense(session: Session, expenseId: Id): Promise<void>;
  attachReceipt(session: Session, expenseId: Id, file: { name: string; data: Uint8Array }): Promise<Expense>;
  removeReceipt(session: Session, expenseId: Id): Promise<Expense>;
  /** The receipt file, for its owner only (else not_found). */
  readReceipt(session: Session, expenseId: Id): Promise<{ file: ReceiptFile; data: Uint8Array }>;
  matchTransaction(session: Session, transactionId: Id, match: BankMatchInput): Promise<BankTransaction>;
  /** Undoes a match (a payment marked on an invoice is taken off again; a cost stays). */
  unmatchTransaction(session: Session, transactionId: Id): Promise<BankTransaction>;
  /** Demo: connects the pretend bank. Live: starts the provider's consent flow. */
  connectDemoBank(session: Session): Promise<BankConnection>;
  /** Demo: renews the bank consent for another 180 days. */
  renewBankConsent(session: Session): Promise<BankConnection>;
  /** Admin: every therapist's add-on status, and the monthly fee. */
  listAddons(session: Session): Promise<{ feeCents: number; therapists: BooksAddonRow[] }>;
  /** Admin: switches a therapist's add-on on (from the next rent invoice the fee is charged) or off. Data is kept. */
  setAddon(session: Session, therapistId: Id, on: boolean): Promise<BooksAddonRow>;
  /** Admin: the monthly fee excl. BTW (21%). */
  setAddonFee(session: Session, feeCents: number): Promise<number>;
}

export interface BooksAddonRow {
  therapistId: Id;
  name: string;
  status: "off" | "requested" | "active";
  since: string | null;
  termsAccepted: boolean;
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
  invoices: InvoiceAccess;
  books: BooksStore;
  feeds: FeedStore;
};
