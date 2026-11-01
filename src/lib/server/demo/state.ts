// In-memory state of the demo store. One object holds every "table".

import type {
  Appointment,
  AvailabilityRule,
  BalancePayment,
  BankConnection,
  BankTransaction,
  BlockSeries,
  BlockTemplate,
  CancellationPolicy,
  Client,
  Expense,
  Id,
  IntakeInput,
  Invoice,
  Iso,
  PaperWindow,
  RentRate,
  RentSettings,
  Room,
  RoomBlock,
  Service,
  SessionType,
  Therapist,
  TherapistBusiness,
  Therapy,
  TimeOff,
} from "@/lib/domain/types";

/** Intake answers, kept apart from appointments (like the `intakes` table). */
export interface StoredIntake {
  appointmentId: Id;
  answers: IntakeInput;
  /** D18: set to "now" when a hold expires or a booking is cancelled before it starts. */
  deleteAfter: Iso | null;
}

export interface DemoState {
  therapies: Therapy[];
  rooms: Room[];
  blockTemplates: BlockTemplate[];
  therapists: Therapist[];
  /** Login e-mail per therapist (not public; admin enters it at invite). */
  therapistLoginEmails: Record<Id, string>;
  business: TherapistBusiness[];
  services: Service[];
  sessionTypes: SessionType[];
  policies: CancellationPolicy[];
  availability: AvailabilityRule[];
  timeOff: TimeOff[];
  blockSeries: BlockSeries[];
  blocks: RoomBlock[];
  paperWindows: PaperWindow[];
  clients: Client[];
  /** Which therapist entered a manual client (clients.created_by). */
  clientCreatedBy: Record<Id, Id>;
  appointments: Appointment[];
  /** Mollie (demo) payment id per confirmed appointment, for idempotent confirm. */
  appointmentPayment: Record<Id, string>;
  intakes: StoredIntake[];
  balancePayments: BalancePayment[];
  /** Cancellation policy frozen at booking (D6; the DB snapshots it on the appointment). */
  appointmentPolicy: Record<Id, CancellationPolicy>;
  /** Demo refunds (Mollie refunds later). */
  refunds: Array<{ id: Id; appointmentId: Id; amountCents: number; reason: "client_cancellation" | "therapist_cancellation" }>;
  /** Client invoices (therapist = seller) and room-rent invoices (centre = seller). */
  invoices: Invoice[];
  /** Last number used per seller and year: key from sequenceKey(). Like invoice_sequences. */
  invoiceSequences: Record<string, number>;
  /** Bookkeeping (D40): costs, receipt files, bank connections and bank payments, per owner. */
  expenses: Expense[];
  /** Receipt file bytes by receipt id (Supabase Storage later). */
  receiptData: Record<Id, Uint8Array>;
  bankConnections: BankConnection[];
  bankTransactions: BankTransaction[];
  /** Bookkeeping add-on per therapist (D44). */
  booksAddon: Record<Id, { status: "requested" | "active"; since: string; termsAcceptedAt: Iso | null }>;
  /** Monthly add-on fee excl. BTW (21%), on the rent invoice. Placeholder until the owner sets it. */
  booksAddonFeeCents: number;
  rentRates: RentRate[];
  rentSettings: RentSettings;
  /** Block series are materialised up to this local date. */
  materializedUntil: string;
  seededAt: Iso;
}
