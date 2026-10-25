// Test-only builders for the scheduling engine tests. Not exported from index.ts.
import type {
  Appointment,
  AvailabilityRule,
  BlockTemplate,
  PaperWindow,
  Room,
  RoomBlock,
  Therapist,
} from "@/lib/domain/types";
import { localToUtc } from "./tz";

/** Local Amsterdam wall time -> ISO UTC. `at("2026-03-29", "08:00")`. */
export const at = (date: string, time: string): string => localToUtc(date, time);

export const sharedRoom: Room = {
  id: "room-1",
  number: 1,
  name: "Room 1",
  kind: "shared",
  active: true,
  privateTherapistId: null,
};

export const privateRoom: Room = {
  id: "room-3",
  number: 3,
  name: "Room 3",
  kind: "private",
  active: true,
  privateTherapistId: "t-private",
};

export const rooms: Room[] = [sharedRoom, privateRoom];

export const templates: BlockTemplate[] = [
  { id: "bt-am", startTime: "08:00", endTime: "12:00", active: true },
  { id: "bt-pm", startTime: "13:00", endTime: "17:00", active: true },
  { id: "bt-eve", startTime: "18:00", endTime: "22:00", active: true },
];

export function therapist(overrides: Partial<Therapist> = {}): Therapist {
  return {
    id: "t-shared",
    slug: "anna",
    displayName: "Anna",
    bio: { nl: "", en: "" },
    photoUrl: null,
    publicEmail: null,
    therapyIds: [],
    bookable: true,
    paperCalendar: false,
    bufferMinutes: 0,
    reminderHours: 24,
    intakeRetentionDays: 365,
    onboardingStatus: "complete",
    ...overrides,
  };
}

export function block(date: string, start = "08:00", end = "12:00", overrides: Partial<RoomBlock> = {}): RoomBlock {
  return {
    id: `blk-${date}-${start}`,
    roomId: sharedRoom.id,
    therapistId: "t-shared",
    period: { start: at(date, start), end: at(date, end) },
    seriesId: null,
    status: "reserved",
    ...overrides,
  };
}

export function rule(weekday: AvailabilityRule["weekday"], startTime: string, endTime: string, therapistId = "t-private"): AvailabilityRule {
  return { id: `r-${weekday}-${startTime}`, therapistId, weekday, startTime, endTime };
}

export function paperWindow(date: string, start: string, end: string, overrides: Partial<PaperWindow> = {}): PaperWindow {
  return {
    id: `pw-${date}-${start}`,
    therapistId: "t-paper",
    roomId: privateRoom.id,
    period: { start: at(date, start), end: at(date, end) },
    status: "open",
    ...overrides,
  };
}

let seq = 0;
export function appointment(
  date: string,
  start: string,
  durationMin: number,
  bufferMinutes: number,
  overrides: Partial<Appointment> = {},
): Appointment {
  const s = Date.parse(at(date, start));
  const sessionEnd = s + durationMin * 60_000;
  return {
    id: `appt-${++seq}`,
    therapistId: "t-shared",
    roomId: sharedRoom.id,
    roomBlockId: null,
    clientId: "c-1",
    sessionTypeId: "st-1",
    session: { start: new Date(s).toISOString(), end: new Date(sessionEnd).toISOString() },
    occupied: {
      start: new Date(s).toISOString(),
      end: new Date(sessionEnd + bufferMinutes * 60_000).toISOString(),
    },
    status: "confirmed",
    holdExpiresAt: null,
    source: "online",
    snapshot: {
      serviceName: { nl: "Acupunctuur", en: "Acupuncture" },
      sessionTypeName: { nl: "Vervolg", en: "Follow-up" },
      durationMin,
      priceCents: 8000,
      depositCents: 2000,
      bufferMinutes,
    },
    ...overrides,
  };
}

/** Whole local day as a UTC range. */
export const day = (date: string, toDate?: string) => ({
  start: at(date, "00:00"),
  end: at(toDate ?? date, "24:00"),
});
