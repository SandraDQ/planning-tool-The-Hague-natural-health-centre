// Pure scheduling engine (no I/O, no hidden clock: pass `now`).
// See PLAN.md section 4, master prompt section 3, handoffs/mvp-scheduling-engine.md.
// Domain times are ISO UTC; everything local is Europe/Amsterdam and DST-safe.

export {
  CENTRE_TIME_ZONE,
  addDays,
  datesBetween,
  isoWeekday,
  localToUtc,
  localToUtcMs,
  parseTime,
  tzOffsetMinutes,
  utcToLocal,
  type LocalDateTime,
} from "./tz";
export {
  contains,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  type Instant,
  type MsInterval,
} from "./intervals";
export { HOLD_MINUTES, canConfirmHold, holdExpiresAt, isActiveAppointment, isHoldExpired } from "./holds";
export {
  candidateWindows,
  subtractBusy,
  type CandidateWindow,
  type CandidateWindowsInput,
  type WindowSource,
} from "./windows";
export {
  DEFAULT_GRID_MINUTES,
  findSlots,
  generateSlots,
  sessionsThatFit,
  type EngineSlot,
  type FindSlotsInput,
  type GenerateSlotsInput,
} from "./slots";
export {
  findContainingBlock,
  occupiedFor,
  validateAppointment,
  type AppointmentCandidate,
  type ValidateAppointmentInput,
} from "./validate";
export {
  blockPeriod,
  canReleaseBlock,
  canReserveBlock,
  expandBlockSeries,
  type BlockActor,
  type CanReleaseBlockInput,
  type CanReserveBlockInput,
  type ExpandOptions,
} from "./blocks";
