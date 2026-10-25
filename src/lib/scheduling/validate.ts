// The database rules for one appointment, in TypeScript (the DB stays the final referee).
//  - occupied = session + buffer                                  (appointments_period_includes_buffer)
//  - shared room: occupied inside a reserved block of the same therapist and room   (TH001)
//  - private room: only its assigned therapist                    (TH002)
//  - paper window: open, same therapist/room, contains the session, booked once     (TH007)
//  - no overlap with the therapist's or the room's held/confirmed appointments      (23P01)
import type { Appointment, Id, Interval, PaperWindow, Room, RoomBlock } from "@/lib/domain/types";
import type { DomainErrorCode } from "@/lib/domain/store";
import { isActiveAppointment } from "./holds";
import { type Instant, MINUTE_MS, contains, isValidInterval, msInterval, overlaps, toIso } from "./intervals";

/** The interval that may not overlap: the session plus the therapist's buffer. */
export function occupiedFor(session: Interval, bufferMinutes: number): Interval {
  return { start: session.start, end: toIso(Date.parse(session.end) + bufferMinutes * MINUTE_MS) };
}

export interface AppointmentCandidate {
  /** Set when moving an existing appointment, so it does not clash with itself. */
  id?: Id;
  therapistId: Id;
  roomId: Id;
  session: Interval;
  bufferMinutes: number;
}

/** The reserved block of this therapist in this room that contains session + buffer. */
export function findContainingBlock(blocks: RoomBlock[], c: AppointmentCandidate): RoomBlock | null {
  const occ = msInterval(occupiedFor(c.session, c.bufferMinutes));
  return (
    blocks.find(
      (b) => b.status === "reserved" && b.roomId === c.roomId && b.therapistId === c.therapistId && contains(msInterval(b.period), occ),
    ) ?? null
  );
}

export interface ValidateAppointmentInput {
  appointment: AppointmentCandidate;
  rooms: Room[];
  roomBlocks: RoomBlock[];
  /** Appointments of this therapist and this room (others are ignored). */
  appointments: Appointment[];
  /** Required when booking into a paper-calendar window. */
  paperWindow?: PaperWindow | null;
  /** Optional extra busy time (time off, external calendar). The DB does not check these. */
  busy?: Interval[];
  /** With `now`, expired holds no longer block (the booking transaction deletes them first). */
  now?: Instant;
}

/** null when the appointment may be stored, otherwise the DomainErrorCode to throw. */
export function validateAppointment(input: ValidateAppointmentInput): DomainErrorCode | null {
  const c = input.appointment;
  const session = msInterval(c.session);
  if (!isValidInterval(session) || !Number.isInteger(c.bufferMinutes) || c.bufferMinutes < 0) return "invalid";
  const occupied = msInterval(occupiedFor(c.session, c.bufferMinutes));

  const room = input.rooms.find((r) => r.id === c.roomId);
  if (!room) return "not_found";
  if (!room.active) return "invalid";
  if (room.kind === "shared") {
    if (!findContainingBlock(input.roomBlocks, c)) return "outside_block";
  } else if (room.privateTherapistId !== c.therapistId) {
    return "forbidden";
  }

  const active = input.appointments.filter((a) => a.id !== c.id && isActiveAppointment(a, input.now));

  const pw = input.paperWindow;
  if (pw) {
    if (pw.therapistId !== c.therapistId || pw.roomId !== c.roomId) return "invalid";
    if (!contains(msInterval(pw.period), session)) return "invalid";
    if (pw.status !== "open") return "slot_taken";
    const p = msInterval(pw.period);
    if (active.some((a) => a.therapistId === c.therapistId && overlaps(msInterval(a.session), p))) return "slot_taken";
  }

  for (const a of active) {
    if ((a.therapistId === c.therapistId || a.roomId === c.roomId) && overlaps(msInterval(a.occupied), occupied)) {
      return "slot_taken";
    }
  }
  for (const b of input.busy ?? []) {
    const bi = msInterval(b);
    if (isValidInterval(bi) && overlaps(bi, occupied)) return "slot_taken";
  }
  return null;
}
