// In-memory state of the demo store. One object holds every "table".

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
  rentRates: RentRate[];
  rentSettings: RentSettings;
  /** Block series are materialised up to this local date. */
  materializedUntil: string;
  seededAt: Iso;
}
