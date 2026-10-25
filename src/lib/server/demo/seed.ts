// Demo seed: fake but realistic data, relative to the current week so the demo always looks current.
// Deterministic: every server instance seeded in the same week (Europe/Amsterdam) holds identical
// data, with the same ids (readable keys or UUIDv5 from ./ids). Nothing depends on the time of day.
// Rooms, block templates and therapies mirror supabase/seed.sql. Every person here is
// FICTIONAL ("Demo – …" names, e-mail addresses on the reserved .invalid domain).

import type {
  Appointment,
  AvailabilityRule,
  BlockSeries,
  CancellationPolicy,
  Client,
  Id,
  Locale,
  Service,
  SessionType,
  Therapist,
  TherapistBusiness,
  Therapy,
} from "@/lib/domain/types";
import { insertAppointment, makeAppointment } from "./build";
import { stableId } from "./ids";
import { candidateWindows, validateInState } from "./rules";
import { SERIES_HORIZON_WEEKS, materializeSeries } from "./series";
import type { DemoState } from "./state";
import { MINUTE, addDays, iso, localDateOf, localToUtcIso, mondayOf, ms, overlaps } from "./time";

const t = (nl: string, en: string): Record<Locale, string> => ({ nl, en });

const THERAPIES: Array<[string, string, string]> = [
  ["acupuncture", "Acupunctuur", "Acupuncture"],
  ["chinese-herbs", "Chinese kruiden", "Chinese Herbs"],
  ["high-power-laser", "High Power Lasertherapie", "High Power Laser Therapy"],
  ["ayurveda", "Ayurveda", "Ayurveda"],
  ["coaching", "Coaching", "Coaching"],
  ["doula", "Doula", "Doula"],
  ["homeopathy", "Homeopathie", "Homeopathy"],
  ["massage", "Massage", "Massage"],
  ["nutrition", "Voeding", "Nutrition"],
  ["orthomolecular", "Orthomoleculaire therapie", "Orthomolecular Therapy"],
  ["psychology", "Psychologie", "Psychology"],
  ["reiki", "Reiki", "Reiki"],
  ["shamanism", "Sjamanisme", "Shamanism"],
];
const therapyId = (slug: string) => `therapy-${slug}`;

/** Stable ids so links in the demo keep working across restarts. */
export const DEMO_IDS = {
  admin: "demo-admin",
  clientLotte: "client-lotte",
  therapists: {
    anna: "th-anna",
    bram: "th-bram",
    carla: "th-carla",
    daan: "th-daan",
    eva: "th-eva",
    femke: "th-femke",
    gijs: "th-gijs",
  },
  rooms: { 1: "room-1", 2: "room-2", 3: "room-3", 4: "room-4", 5: "room-5", 6: "room-6" } as Record<number, Id>,
  templates: { morning: "tpl-morning", afternoon: "tpl-afternoon", evening: "tpl-evening" },
} as const;

const T = DEMO_IDS.therapists;

interface TherapistSeed {
  id: Id;
  first: string;
  last: string;
  therapies: string[];
  buffer: number;
  paper?: boolean;
  invited?: boolean;
  bio: Record<Locale, string>;
  services: Array<{
    id: Id;
    therapy: string;
    name: Record<Locale, string>;
    description: Record<Locale, string>;
    deposit: ["fixed" | "percent", number];
    types: Array<[Id, Record<Locale, string>, number, number]>; // id, name, minutes, cents
  }>;
  policy?: Omit<CancellationPolicy, "therapistId">;
}

const policy24h = (fee: number): Omit<CancellationPolicy, "therapistId"> => ({
  noticeValue: 24,
  noticeUnit: "hours",
  feeType: "percent",
  feeValue: fee,
  exemptNewClients: false,
  text: t(
    `Kosteloos annuleren tot 24 uur vooraf. Daarna betaalt u ${fee}% van de prijs.`,
    `Free cancellation up to 24 hours before. After that you pay ${fee}% of the price.`,
  ),
});

const THERAPISTS: TherapistSeed[] = [
  {
    id: T.anna,
    first: "Anna",
    last: "de Vries",
    therapies: ["acupuncture", "chinese-herbs"],
    buffer: 15,
    bio: t(
      "Demo-profiel. Anna werkt met acupunctuur en Chinese kruiden bij stress, slaapproblemen en pijnklachten.",
      "Demo profile. Anna uses acupuncture and Chinese herbs for stress, sleep problems and pain.",
    ),
    services: [
      {
        id: "svc-anna-acu",
        therapy: "acupuncture",
        name: t("Acupunctuur", "Acupuncture"),
        description: t("Behandeling met dunne naaldjes, afgestemd op uw klachten.", "Treatment with fine needles, tailored to your complaints."),
        deposit: ["fixed", 2500],
        types: [
          ["st-anna-acu-first", t("Eerste consult met intake", "First consultation with intake"), 90, 9500],
          ["st-anna-acu-follow", t("Vervolgbehandeling", "Follow-up treatment"), 60, 7500],
        ],
      },
      {
        id: "svc-anna-herbs",
        therapy: "chinese-herbs",
        name: t("Kruidenconsult", "Herbal consultation"),
        description: t("Advies over Chinese kruiden die bij u passen.", "Advice on Chinese herbs that suit you."),
        deposit: ["percent", 25],
        types: [["st-anna-herbs", t("Consult 45 min", "Consultation 45 min"), 45, 6000]],
      },
    ],
    policy: policy24h(100),
  },
  {
    id: T.bram,
    first: "Bram",
    last: "Jansen",
    therapies: ["massage"],
    buffer: 10,
    bio: t("Demo-profiel. Bram geeft ontspannende en herstellende massages.", "Demo profile. Bram gives relaxing and restorative massages."),
    services: [
      {
        id: "svc-bram-massage",
        therapy: "massage",
        name: t("Ontspanningsmassage", "Relaxation massage"),
        description: t("Een rustige massage van het hele lichaam.", "A calm full-body massage."),
        deposit: ["fixed", 2000],
        types: [
          ["st-bram-60", t("Massage 60 min", "Massage 60 min"), 60, 7000],
          ["st-bram-90", t("Massage 90 min", "Massage 90 min"), 90, 9500],
        ],
      },
    ],
    policy: {
      noticeValue: 48,
      noticeUnit: "hours",
      feeType: "fixed",
      feeValue: 3500,
      exemptNewClients: true,
      text: t(
        "Kosteloos annuleren tot 48 uur vooraf. Daarna betaalt u € 35. Nieuwe cliënten betalen geen annuleringskosten.",
        "Free cancellation up to 48 hours before. After that you pay € 35. New clients pay no cancellation fee.",
      ),
    },
  },
  {
    id: T.carla,
    first: "Carla",
    last: "Mendes",
    therapies: ["psychology", "coaching"],
    buffer: 10,
    bio: t("Demo-profiel. Carla is psycholoog en coach, in het Nederlands en Engels.", "Demo profile. Carla is a psychologist and coach, in Dutch and English."),
    services: [
      {
        id: "svc-carla-psy",
        therapy: "psychology",
        name: t("Gesprekstherapie", "Talk therapy"),
        description: t("Persoonlijke gesprekken in een veilige omgeving.", "Personal conversations in a safe setting."),
        deposit: ["percent", 50],
        types: [["st-carla-psy", t("Sessie 50 min", "Session 50 min"), 50, 9000]],
      },
      {
        id: "svc-carla-coach",
        therapy: "coaching",
        name: t("Coachingsessie", "Coaching session"),
        description: t("Samen werken aan een concreet doel.", "Working together on a clear goal."),
        deposit: ["fixed", 2500],
        types: [["st-carla-coach", t("Coaching 60 min", "Coaching 60 min"), 60, 8500]],
      },
    ],
    policy: {
      noticeValue: 2,
      noticeUnit: "business_days",
      feeType: "percent",
      feeValue: 50,
      exemptNewClients: false,
      text: t(
        "Kosteloos annuleren tot 2 werkdagen vooraf. Daarna betaalt u 50% van de prijs.",
        "Free cancellation up to 2 business days before. After that you pay 50% of the price.",
      ),
    },
  },
  {
    id: T.daan,
    first: "Daan",
    last: "Bakker",
    therapies: ["reiki"],
    buffer: 0,
    bio: t("Demo-profiel. Daan geeft reiki voor rust en ontspanning.", "Demo profile. Daan offers reiki for calm and relaxation."),
    services: [
      {
        id: "svc-daan-reiki",
        therapy: "reiki",
        name: t("Reikibehandeling", "Reiki treatment"),
        description: t("Een rustige behandeling met handoplegging.", "A calm hands-on treatment."),
        deposit: ["fixed", 1500],
        types: [
          ["st-daan-60", t("Behandeling 60 min", "Treatment 60 min"), 60, 6000],
          ["st-daan-30", t("Korte sessie 30 min", "Short session 30 min"), 30, 3500],
        ],
      },
    ],
    policy: policy24h(50),
  },
  {
    id: T.eva,
    first: "Eva",
    last: "Smit",
    therapies: ["ayurveda", "nutrition"],
    buffer: 15,
    bio: t("Demo-profiel. Eva combineert ayurveda met voedingsadvies.", "Demo profile. Eva combines ayurveda with nutrition advice."),
    services: [
      {
        id: "svc-eva-ayur",
        therapy: "ayurveda",
        name: t("Ayurvedisch consult", "Ayurvedic consultation"),
        description: t("Een uitgebreid consult over uw constitutie en leefstijl.", "An in-depth consultation about your constitution and lifestyle."),
        deposit: ["percent", 25],
        types: [["st-eva-ayur", t("Consult 75 min", "Consultation 75 min"), 75, 9000]],
      },
      {
        id: "svc-eva-nutr",
        therapy: "nutrition",
        name: t("Voedingsadvies", "Nutrition advice"),
        description: t("Praktisch advies over eten dat bij u past.", "Practical advice on food that suits you."),
        deposit: ["fixed", 2000],
        types: [["st-eva-nutr", t("Advies 45 min", "Advice 45 min"), 45, 6500]],
      },
    ],
    policy: policy24h(100),
  },
  {
    id: T.femke,
    first: "Femke",
    last: "Visser",
    therapies: ["homeopathy", "orthomolecular"],
    buffer: 15,
    paper: true,
    bio: t(
      "Demo-profiel. Femke werkt met homeopathie en orthomoleculaire therapie. Zij plant vooral via haar papieren agenda.",
      "Demo profile. Femke works with homeopathy and orthomolecular therapy. She mostly plans in her paper diary.",
    ),
    services: [
      {
        id: "svc-femke-homeo",
        therapy: "homeopathy",
        name: t("Homeopathisch consult", "Homeopathic consultation"),
        description: t("Een consult waarin uw hele gezondheid aan bod komt.", "A consultation that looks at your health as a whole."),
        deposit: ["fixed", 3000],
        types: [
          ["st-femke-first", t("Eerste consult", "First consultation"), 90, 11000],
          ["st-femke-follow", t("Vervolgconsult", "Follow-up consultation"), 45, 6000],
        ],
      },
    ],
    policy: {
      noticeValue: 48,
      noticeUnit: "hours",
      feeType: "percent",
      feeValue: 50,
      exemptNewClients: false,
      text: t("Kosteloos annuleren tot 48 uur vooraf.", "Free cancellation up to 48 hours before."),
    },
  },
  {
    id: T.gijs,
    first: "Gijs",
    last: "Mulder",
    therapies: ["shamanism"],
    buffer: 15,
    invited: true,
    bio: t("", ""),
    services: [],
  },
];

const CLIENTS: Array<[Id, string, string, Locale]> = [
  [DEMO_IDS.clientLotte, "Lotte", "Willems", "nl"],
  ["client-sanne", "Sanne", "de Boer", "nl"],
  ["client-mo", "Mohammed", "El Amrani", "nl"],
  ["client-julia", "Julia", "Novak", "en"],
  ["client-pieter", "Pieter", "Hendriks", "nl"],
  ["client-yara", "Yara", "Kaya", "nl"],
  ["client-tom", "Tom", "Peeters", "en"],
  ["client-ines", "Ines", "Rossi", "en"],
];

/** Weekly shared-room reservations: room, therapist, ISO weekday, template. */
const SERIES: Array<[number, Id, 1 | 2 | 3 | 4 | 5 | 6 | 7, keyof typeof DEMO_IDS.templates]> = [
  [1, T.daan, 1, "morning"],
  [1, T.eva, 2, "afternoon"],
  [1, T.femke, 4, "evening"],
  [2, T.femke, 1, "afternoon"],
  [2, T.daan, 5, "afternoon"],
  [2, T.eva, 4, "morning"],
  [5, T.eva, 6, "morning"],
  [5, T.femke, 3, "morning"],
  [5, T.daan, 3, "evening"],
];

const WORKING_HOURS: Array<[Id, Array<1 | 2 | 3 | 4 | 5 | 6 | 7>, string, string]> = [
  [T.anna, [1, 2, 4], "09:00", "17:00"],
  [T.bram, [2, 3, 4, 5], "10:00", "18:00"],
  [T.carla, [1, 3, 5], "09:00", "16:00"],
];

const REASONS = [
  "Demo: last van gespannen schouders",
  "Demo: slecht slapen sinds een paar maanden",
  "Demo: wil graag meer energie",
  "Demo: stress door werk",
  "Demo: terugkerende hoofdpijn",
  "Demo: follow-up of last session",
];

/** Small deterministic PRNG, so the seed looks the same on every restart. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeedState(now: Date = new Date()): DemoState {
  // The reference instant is Monday 00:00 of the current week, never "now" itself.
  const weekStart = mondayOf(localDateOf(now.getTime()));
  const refMs = ms(localToUtcIso(weekStart, "00:00"));
  const firstMonday = addDays(weekStart, -7);
  const horizon = addDays(weekStart, SERIES_HORIZON_WEEKS * 7);
  const year = weekStart.slice(0, 4);
  const rnd = prng(20261025);

  const therapies: Therapy[] = THERAPIES.map(([slug, nl, en]) => ({ id: therapyId(slug), name: t(nl, en), active: true }));

  const therapists: Therapist[] = THERAPISTS.map((s) => ({
    id: s.id,
    slug: `demo-${s.first}-${s.last}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    displayName: `Demo – ${s.first} ${s.last}`,
    bio: s.bio,
    photoUrl: null,
    publicEmail: s.invited ? null : `${s.first.toLowerCase()}@example.invalid`,
    therapyIds: s.therapies.map(therapyId),
    bookable: !s.invited,
    paperCalendar: Boolean(s.paper),
    bufferMinutes: s.buffer,
    reminderHours: 24,
    intakeRetentionDays: 365,
    onboardingStatus: s.invited ? "invited" : "complete",
  }));

  const services: Service[] = [];
  const sessionTypes: SessionType[] = [];
  for (const s of THERAPISTS) {
    for (const svc of s.services) {
      services.push({
        id: svc.id,
        therapistId: s.id,
        therapyId: therapyId(svc.therapy),
        name: svc.name,
        description: svc.description,
        depositType: svc.deposit[0],
        depositValue: svc.deposit[1],
        archived: false,
      });
      for (const [id, name, durationMin, priceCents] of svc.types) sessionTypes.push({ id, serviceId: svc.id, name, durationMin, priceCents });
    }
  }

  const policies: CancellationPolicy[] = THERAPISTS.filter((s) => s.policy).map((s) => ({ therapistId: s.id, ...s.policy! }));

  const business: TherapistBusiness[] = THERAPISTS.filter((s) => !s.invited).map((s, i) => ({
    therapistId: s.id,
    legalName: `Demo – ${s.first} ${s.last}`,
    tradeName: `Demo Praktijk ${s.first}`,
    address: `Voorbeeldstraat ${i + 1}, 2500 AA Den Haag (demo)`,
    kvk: `9000000${i + 1}`,
    btwNumber: i % 2 === 0 ? `NL00000000${i + 1}B01` : null,
    kor: i % 2 === 1,
  }));

  const availability: AvailabilityRule[] = WORKING_HOURS.flatMap(([therapistId, days, startTime, endTime]) =>
    days.map((weekday) => ({ id: `avail-${therapistId}-${weekday}`, therapistId, weekday, startTime, endTime })),
  );

  const clients: Client[] = CLIENTS.map(([id, firstName, lastName, locale], i) => ({
    id,
    firstName,
    lastName,
    email: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]+/g, "") + "@example.invalid",
    phone: `+31 6 0000 00${String(i + 10)}`,
    locale,
  }));

  const state: DemoState = {
    therapies,
    rooms: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: DEMO_IDS.rooms[n],
      number: n,
      name: `Kamer ${n}`,
      kind: n === 3 || n === 4 || n === 6 ? "private" : "shared",
      active: true,
      privateTherapistId: n === 3 ? T.anna : n === 4 ? T.bram : n === 6 ? T.carla : null,
    })),
    blockTemplates: [
      { id: DEMO_IDS.templates.morning, startTime: "08:00", endTime: "12:00", active: true },
      { id: DEMO_IDS.templates.afternoon, startTime: "13:00", endTime: "17:00", active: true },
      { id: DEMO_IDS.templates.evening, startTime: "18:00", endTime: "22:00", active: true },
    ],
    therapists,
    therapistLoginEmails: Object.fromEntries(THERAPISTS.map((s) => [s.id, `${s.first.toLowerCase()}.login@example.invalid`])),
    business,
    services,
    sessionTypes,
    policies,
    availability,
    timeOff: [
      {
        id: "timeoff-anna",
        therapistId: T.anna,
        period: { start: localToUtcIso(addDays(weekStart, 14 + 3), "00:00"), end: localToUtcIso(addDays(weekStart, 14 + 4), "00:00") },
        note: "Demo: vrije dag",
      },
    ],
    blockSeries: [],
    blocks: [],
    paperWindows: [],
    clients,
    clientCreatedBy: {},
    appointments: [],
    appointmentPayment: {},
    intakes: [],
    balancePayments: [],
    appointmentPolicy: {},
    refunds: [],
    rentRates: [
      { id: "rate-room-3", roomId: DEMO_IDS.rooms[3], pricingMode: "fixed_monthly", amountCents: 65000, btwTreatment: "exempt", validFrom: `${year}-01-01`, validTo: null },
      { id: "rate-room-4", roomId: DEMO_IDS.rooms[4], pricingMode: "fixed_monthly", amountCents: 60000, btwTreatment: "exempt", validFrom: `${year}-01-01`, validTo: null },
      { id: "rate-room-6", roomId: DEMO_IDS.rooms[6], pricingMode: "fixed_monthly", amountCents: 72500, btwTreatment: "exempt", validFrom: `${year}-01-01`, validTo: null },
      { id: "rate-default-block", roomId: null, pricingMode: "per_block", amountCents: 4000, btwTreatment: "exempt", validFrom: `${year}-01-01`, validTo: null },
    ],
    rentSettings: { billingDay: 1, paymentTermDays: 14, autoSend: false },
    materializedUntil: horizon,
    seededAt: iso(refMs),
  };

  // Weekly block series, materialised from last week up to the horizon.
  SERIES.forEach(([room, therapistId, weekday, tpl], i) => {
    const series: BlockSeries = {
      id: `series-${i + 1}`,
      roomId: DEMO_IDS.rooms[room],
      therapistId,
      weekday,
      blockTemplateId: DEMO_IDS.templates[tpl],
      startsOn: firstMonday,
      endsOn: null,
    };
    state.blockSeries.push(series);
    materializeSeries(state, series, horizon);
  });

  // Paper windows for the paper-calendar therapist: Monday 14–16 inside her room-2 block.
  for (let week = 0; week < 4; week++) {
    const date = addDays(weekStart, 7 * (week + 1));
    state.paperWindows.push({
      id: `paper-${week + 1}`,
      therapistId: T.femke,
      roomId: DEMO_IDS.rooms[2],
      period: { start: localToUtcIso(date, "14:00"), end: localToUtcIso(date, "16:00") },
      status: "open",
    });
  }

  seedAppointments(state, { nowMs: refMs, from: firstMonday, to: addDays(weekStart, 27), rnd });
  return state;
}

/** `nowMs` is the seed's reference instant (Monday 00:00 of this week), not the real time. */
function seedAppointments(state: DemoState, opts: { nowMs: number; from: string; to: string; rnd: () => number }) {
  const { nowMs, rnd } = opts;
  const range = { start: localToUtcIso(opts.from, "00:00"), end: localToUtcIso(opts.to, "23:59") };
  const otherClients = state.clients.filter((c) => c.id !== DEMO_IDS.clientLotte).map((c) => c.id);
  const pick = <X>(xs: X[]) => xs[Math.floor(rnd() * xs.length)];
  const typesOf = (therapistId: Id) =>
    state.sessionTypes.filter((st) => state.services.some((s) => s.id === st.serviceId && s.therapistId === therapistId));

  const place = (therapistId: Id, sessionTypeId: Id, roomId: Id, start: number, source: "online" | "manual", forced?: Appointment["status"]) => {
    const appt = makeAppointment(state, {
      id: stableId(`appointment:${therapistId}:${roomId}:${iso(start)}`),
      sessionTypeId,
      roomId,
      roomBlockId: null,
      clientId: pick(otherClients),
      start: iso(start),
      status: "confirmed",
      source,
      holdExpiresAt: null,
    });
    // Keep paper windows free for online bookings.
    if (!forced && state.paperWindows.some((w) => w.therapistId === therapistId && overlaps(w.period, appt.occupied))) return null;
    const check = validateInState(
      state,
      { therapistId, roomId, session: appt.session, bufferMinutes: appt.snapshot.bufferMinutes },
      { nowMs, busy: state.timeOff.filter((x) => x.therapistId === therapistId).map((x) => x.period) },
    );
    if (check.code) return null;
    appt.roomBlockId = check.roomBlockId;
    const past = ms(appt.session.end) <= nowMs;
    const r = rnd();
    appt.status = forced ?? (past ? (r < 0.92 ? "completed" : "no_show") : r < 0.88 ? "confirmed" : "cancelled");
    insertAppointment(state, appt);
    if (appt.source === "online" && appt.status !== "cancelled") storeIntake(state, appt, pick(REASONS), rnd() < 0.3);
    if (appt.status === "confirmed" || appt.status === "completed" || appt.status === "no_show") {
      if (appt.source === "online") state.appointmentPayment[appt.id] = `demo_tr_${appt.id.slice(0, 8)}`;
    }
    return appt;
  };

  for (const therapist of state.therapists) {
    const types = typesOf(therapist.id);
    if (!types.length || !therapist.bookable) continue;
    // Paper-calendar therapists fill their own blocks by hand (manual bookings).
    const windows = therapist.paperCalendar
      ? state.blocks
          .filter((b) => b.therapistId === therapist.id && ms(b.period.start) >= ms(range.start) && ms(b.period.end) <= ms(range.end))
          .map((b) => ({ roomId: b.roomId, period: b.period }))
      : candidateWindows(state, therapist, range).map((w) => ({ roomId: w.roomId, period: { start: w.start, end: w.end } }));
    for (const w of windows) {
      let cursor = ms(w.period.start);
      const end = ms(w.period.end);
      while (cursor < end) {
        const st = pick(types);
        const length = (st.durationMin + therapist.bufferMinutes) * MINUTE;
        if (cursor + length > end) break;
        if (rnd() < 0.5) {
          const source = therapist.paperCalendar || rnd() < 0.2 ? "manual" : "online";
          if (place(therapist.id, st.id, w.roomId, cursor, source)) {
            cursor += length;
            continue;
          }
        }
        cursor += (rnd() < 0.5 ? 30 : 60) * MINUTE;
      }
    }
  }

  // The demo client (login "client") gets one past and one upcoming booking.
  const byStart = [...state.appointments].sort((a, b) => ms(a.session.start) - ms(b.session.start));
  const past = byStart.find((a) => a.status === "completed" && a.source === "online");
  const upcoming = byStart.find((a) => a.status === "confirmed" && a.source === "online" && ms(a.session.start) > nowMs + 7 * 86_400_000); // next week: always still upcoming
  if (past) past.clientId = DEMO_IDS.clientLotte;
  if (upcoming) upcoming.clientId = DEMO_IDS.clientLotte;

  // One booking in a paper window (it closes once booked).
  const window = state.paperWindows[0];
  if (window) {
    const appt = place(T.femke, "st-femke-follow", window.roomId, ms(window.period.start), "online", "confirmed");
    if (appt) {
      appt.paperWindowId = window.id;
      window.status = "filled";
    }
  }
  // No seeded holds: a hold lives 15 minutes from the moment it is made, which would make
  // instances differ. The booking flow creates real (demo) holds.
}

function storeIntake(state: DemoState, appt: Appointment, reason: string, newClient: boolean) {
  state.intakes.push({
    appointmentId: appt.id,
    answers: { reason, newClient, comments: "Demo – fictieve intake, geen echte gegevens.", acceptedPolicy: true, healthDataConsent: true },
    deleteAfter: null,
  });
}
