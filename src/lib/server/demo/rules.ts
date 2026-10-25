// The database rules for the in-memory demo store, delegated to the pure scheduling
// engine (src/lib/scheduling, see handoffs/mvp-scheduling-engine.md). This file only
// gathers the right rows from the demo state and passes them in.

import type { DomainErrorCode } from "@/lib/domain/store";
import type { Appointment, Id, Interval, PaperWindow, RoomBlock, Therapist } from "@/lib/domain/types";
import {
  HOLD_MINUTES as ENGINE_HOLD_MINUTES,
  candidateWindows as engineCandidateWindows,
  canReleaseBlock,
  canReserveBlock,
  findContainingBlock,
  findSlots as engineFindSlots,
  isActiveAppointment,
  validateAppointment,
  type BlockActor,
  type CandidateWindow,
  type EngineSlot,
} from "@/lib/scheduling";
import type { DemoState } from "./state";
import { ms, overlaps } from "./time";

export const HOLD_MINUTES = ENGINE_HOLD_MINUTES;
/** Online deposits are at least €1 (decision 2, Q7). */
export const MIN_ONLINE_DEPOSIT_CENTS = 100;

/** Held and confirmed appointments occupy time (the exclusion constraints' WHERE clause). */
export const occupies = (a: Appointment, nowMs?: number) => isActiveAppointment(a, nowMs);

/** Appointments relevant to a therapist and the rooms they work in (passing more is safe). */
function relevantAppointments(state: DemoState, therapistId: Id, roomIds?: Set<Id>): Appointment[] {
  return state.appointments.filter((a) => a.therapistId === therapistId || !roomIds || roomIds.has(a.roomId));
}

/** Where a therapist can take online bookings (blocks, paper windows, working hours). */
export function candidateWindows(state: DemoState, therapist: Therapist, range: Interval): CandidateWindow[] {
  return engineCandidateWindows({
    therapist,
    rooms: state.rooms,
    availabilityRules: state.availability,
    roomBlocks: state.blocks,
    paperWindows: state.paperWindows,
    range,
  });
}

/** Valid online start slots for one therapist and session length. */
export function findSlots(state: DemoState, input: { therapist: Therapist; durationMin: number; range: Interval; nowMs: number }): EngineSlot[] {
  return engineFindSlots({
    therapist: input.therapist,
    rooms: state.rooms,
    durationMin: input.durationMin,
    availabilityRules: state.availability,
    roomBlocks: state.blocks,
    paperWindows: state.paperWindows,
    timeOff: state.timeOff,
    externalBusy: [],
    appointments: state.appointments,
    range: input.range,
    now: input.nowMs,
  });
}

/** Room layer + overlap rules for a new or moved appointment. Returns the block id it sits in. */
export function validateInState(
  state: DemoState,
  candidate: { id?: Id; therapistId: Id; roomId: Id; session: Interval; bufferMinutes: number },
  opts: { nowMs: number; paperWindow?: PaperWindow | null; busy?: Interval[] },
): { code: DomainErrorCode | null; roomBlockId: Id | null } {
  const code = validateAppointment({
    appointment: candidate,
    rooms: state.rooms,
    roomBlocks: state.blocks,
    appointments: relevantAppointments(state, candidate.therapistId, new Set([candidate.roomId])),
    paperWindow: opts.paperWindow,
    busy: opts.busy,
    now: opts.nowMs,
  });
  const room = state.rooms.find((r) => r.id === candidate.roomId);
  const roomBlockId = room?.kind === "shared" ? findContainingBlock(state.blocks, candidate)?.id ?? null : null;
  return { code, roomBlockId };
}

export function checkReserveBlock(
  state: DemoState,
  block: { roomId: Id; therapistId: Id; period: Interval },
  actor: BlockActor,
  nowMs: number,
): DomainErrorCode | null {
  return canReserveBlock({
    block,
    rooms: state.rooms,
    existingBlocks: state.blocks.filter((b) => b.roomId === block.roomId),
    templates: state.blockTemplates,
    actor,
    now: nowMs,
  });
}

/** D14. The store cancels expired holds before calling this (tick), as pg_cron does. */
export function checkReleaseBlock(state: DemoState, block: RoomBlock, actor: BlockActor, nowMs: number): DomainErrorCode | null {
  return canReleaseBlock({
    block,
    appointments: relevantAppointments(state, block.therapistId, new Set([block.roomId])),
    actor,
    now: nowMs,
  });
}

/** Room-block exclusion constraint: one reserved block per room at any moment. */
export function blockConflicts(state: DemoState, roomId: Id, period: Interval, ignoreId?: Id): boolean {
  return state.blocks.some((b) => b.id !== ignoreId && b.status === "reserved" && b.roomId === roomId && overlaps(b.period, period));
}

/** D14 for rooms: does a room still hold future held/confirmed bookings? */
export function roomHasFutureBookings(state: DemoState, roomId: Id, nowMs: number): boolean {
  return state.appointments.some((a) => occupies(a, nowMs) && a.roomId === roomId && ms(a.session.end) > nowMs);
}

export function depositCents(
  service: { depositType: "fixed" | "percent"; depositValue: number },
  priceCents: number,
  online: boolean,
): number {
  if (!online) return 0; // Q7: manual bookings default to no deposit.
  const raw = service.depositType === "fixed" ? service.depositValue : Math.round((priceCents * service.depositValue) / 100);
  const d = Math.max(raw, MIN_ONLINE_DEPOSIT_CENTS);
  return priceCents >= MIN_ONLINE_DEPOSIT_CENTS ? Math.min(d, priceCents) : d;
}
