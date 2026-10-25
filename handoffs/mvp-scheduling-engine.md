# MVP · scheduling-engine handoff

**What:** the pure scheduling engine in `src/lib/scheduling/`: no I/O, no hidden clock (every time-dependent function takes `now`), no new dependencies.
**Status:** 76 tests in 5 files, all passing (`pnpm test`). No type errors and no lint errors in `src/lib/scheduling/`.
**Test it:** `pnpm vitest run src/lib/scheduling`

## Decisions

| # | Decision | Why |
|---|---|---|
| S1 | **No date library.** Time zones use a small `Intl` helper (`tz.ts`). | Node 20+ and every current browser ship full ICU. The helper is about 100 lines and covered by DST tests for 2026 and 2027. A mutation test (DST handling switched off) fails 13 tests. |
| S2 | Local times that do not exist (the spring gap, 02:00–03:00) move **forward** (02:30 becomes 03:30 CEST). Local times that happen twice (the autumn overlap) resolve to the **first** occurrence (CEST). | Same as Postgres `AT TIME ZONE` and Temporal's "compatible" mode, so the app and the database agree. |
| S3 | All intervals are half-open `[start, end)`, like `tstzrange '[)'` and `&&`. Back-to-back appointments are fine. | Same rule as the database. |
| S4 | Slot starts sit on a **15-minute local grid** (D2). Starts are stepped in real elapsed time, so the repeated autumn hour gets slots twice and the missing spring hour gets none. A session's end is its start plus duration in real minutes. | DST correctness. |
| S5 | `occupied` = session + buffer. Existing appointments always use their **stored** `occupied` and `snapshot`, never the therapist's current buffer or duration (D6). | Changing a buffer or duration never moves existing bookings. |
| S6 | A shared-room therapist's slots come **only** from their reserved blocks. Weekly working hours open slots only in an active private room assigned to that therapist. Working hours never open a shared room. | Master prompt 3.2. Section 15: a shared-room therapist without a block has no slots. |
| S7 | Paper windows: the **session** must fit inside the window, as `appointments_check_room` checks (`period @> session_period`). The buffer may run past the window, but not into busy time and, in a shared room, not past the therapist's block. In a shared room the window must lie inside a reserved block of that therapist; in a private room, the room must be theirs. | Matches the database. Without this, a 60-minute window would give no slot to a therapist who has a buffer. |
| S8 | A paper window counts as closed when its status is not `open`, **or** when a live hold or confirmed appointment of that therapist overlaps it, even if the store has not yet set it to `filled`. | "Closes after one booking", even when the store is slow to update. |
| S9 | Expired holds (`holdExpiresAt <= now`) block nothing when `now` is passed. Without `now`, every hold counts, which is the database's cautious view. `canReleaseBlock` also ignores expired holds, so **the store must cancel expired holds before it releases a block**, as pg_cron and the booking transaction do. Otherwise the database (TH004) refuses the release. | D5, D14. |
| S10 | Error codes: outside a block → `outside_block` (TH001). Private room not assigned to the therapist → `forbidden` (TH002). Inactive room or bad input → `invalid` (TH006). Paper window filled or already booked → `slot_taken`. Session outside the paper window, or wrong therapist or room → `invalid` (TH007). Any overlap → `slot_taken` / `block_taken` (23P01). A therapist acting on a block that has started → `forbidden` (TH009). Unknown room → `not_found`. | Only codes that already exist in `DomainErrorCode` are used. |
| S11 | When the same start appears in two rooms (a therapist with a private room **and** a shared block), it is returned once. Blocks come before paper windows, and paper windows before working hours. | No duplicate buttons in the booking flow. |
| S12 | `sessionsThatFit` packs sessions back to back **on the 15-minute grid**, because that is what clients can book online. A test checks that it matches greedy packing of `generateSlots`. Pass `gridMinutes: 5` to show the tighter manual-booking count. | 3.3 live preview: the number shown is the number clients can actually book. |
| S13 | Block series ids are `${series.id}:${date}` by default, and `existing` rows are skipped, so expanding again is idempotent and released one-offs stay released (D3). Unknown or inactive templates produce no new blocks. Blocks that already exist are not touched. | D3. |

## API (all from `@/lib/scheduling`)

### Time zone (`tz.ts`)
```ts
localToUtc("2026-03-29", "08:00")          // "2026-03-29T06:00:00.000Z"  (CEST)
localToUtc("2026-10-25", "08:00")          // "2026-10-25T07:00:00.000Z"  (CET)
localToUtcMs(date, minutesAfterMidnight)   // epoch ms; "24:00" = 1440 is allowed
utcToLocal("2026-10-25T01:30:00Z")         // { date: "2026-10-25", time: "02:30", weekday: 7, minuteOfDay: 150, offsetMinutes: 60 }
tzOffsetMinutes(ms) · addDays(date, n) · isoWeekday(date) · datesBetween(from, to) · parseTime("HH:MM") · CENTRE_TIME_ZONE
```

### The whole pipeline: `findSlots` (use this in `PublicStore.findSlots`)
```ts
const slots = findSlots({
  therapist,                 // { id, paperCalendar, bufferMinutes }
  rooms,
  durationMin: sessionType.durationMin,
  // bufferMinutes?: override; defaults to therapist.bufferMinutes
  availabilityRules, roomBlocks, paperWindows, timeOff,
  externalBusy: [],          // 7A busy intervals, later
  appointments,              // this therapist's AND the rooms' appointments; any status (filtered inside)
  range,                     // starts in [range.start, range.end)
  now: new Date(),           // live holds count, expired ones don't; no past slots
  // minNoticeMin?: 0        // 3.4 parked; default 0
});
// -> EngineSlot[] = Slot & { paperWindowId: Id | null }, sorted, unique per start
```

### Building blocks
```ts
candidateWindows({ therapist, rooms, availabilityRules, roomBlocks, paperWindows, range })
  // -> CandidateWindow[] { therapistId, roomId, roomBlockId, paperWindowId, source: "block"|"paper"|"availability",
  //                        start, end, fit: "occupied"|"session", occupiedLimit }
subtractBusy(windows, busy: Interval[])                 // cuts busy time out; keeps the ids
generateSlots({ windows, durationMin, bufferMinutes, gridMinutes = 15, now?, minNoticeMin?, range? })
sessionsThatFit({ blockMinutes: 240, durationMin: 60, bufferMinutes: 15 })   // 3
```

### Validation (call inside the store's write, before inserting or moving)
```ts
const code = validateAppointment({
  appointment: { id?, therapistId, roomId, session, bufferMinutes: therapist.bufferMinutes },
  rooms, roomBlocks, appointments, now,
  paperWindow,        // when booking a paper-calendar therapist (find it from slot.paperWindowId)
  busy,               // optional: time off / external busy (the DB does not check these)
});
if (code) throw new DomainError(code);
const block = findContainingBlock(roomBlocks, candidate);   // -> roomBlockId for the new row
const occupied = occupiedFor(session, bufferMinutes);
```

### Holds
```ts
holdExpiresAt(now)                 // now + 15 min (HOLD_MINUTES)
isHoldExpired(appt, now)           // held && holdExpiresAt <= now
isActiveAppointment(appt, now?)    // confirmed, or held and not expired
canConfirmHold(appt, now)          // null (also when already confirmed: idempotent) | "hold_expired"
```

### Room layer
```ts
blockPeriod("2026-11-02", template)                         // { start, end } UTC
expandBlockSeries(series, templates, range, { existing? })  // RoomBlock[] (status "reserved", seriesId set)
canReserveBlock({ block: { roomId, therapistId, period }, rooms, existingBlocks, templates, actor: "therapist"|"admin", now })
  // null | "not_found" | "invalid" | "forbidden" | "block_taken"
canReleaseBlock({ block, appointments, actor, now })
  // null | "invalid" | "forbidden" | "block_has_appointments"   (D14: also for admin)
```

## Section 15 scenarios covered

| Scenario | Test |
|---|---|
| Shared-room therapist without a block has no slots | `slots.test.ts` › candidateWindows |
| A session cannot run past the block end | `slots.test.ts` › generateSlots; `validate.test.ts` (`outside_block`) |
| Buffer 0 / 15 / 45 changes the slots | `slots.test.ts` (last start 11:00 / 10:45 / 10:15; 13 / 12 / 10 slots) |
| Price or duration change leaves existing bookings alone (snapshot) | `slots.test.ts` › "buffer change applies to new slots only" |
| Paper window closes after one booking | `slots.test.ts` (status `filled` **and** a live hold inside); `validate.test.ts` |
| A manual booking blocks the slot | `slots.test.ts` |
| DST weekends (2026-03-29, 2026-10-25, 2027-03-28, 2027-10-31) | `dst.test.ts`: blocks, evening blocks, the night of the switch (missing and repeated hour), days next to the switch |
| Overlapping holds; two clients for the same slot | `validate.test.ts` (a live hold blocks, an expired one doesn't, a buffer overlap counts) |
| Two therapists reserve the same block | `blocks.test.ts` (in-app check; the race itself is settled by the database exclusion constraint) |
| Series expansion across DST | `dst.test.ts`, `blocks.test.ts` |

Tests that need real concurrency stay with the database tests (`pnpm test:db`).

## Notes for the backend / demo store
- `src/lib/server/demo/rules.ts` and `time.ts` have `TODO(scheduling)` markers. They can now call `findSlots`, `validateAppointment`, `canReserveBlock`, `canReleaseBlock`, `expandBlockSeries` and the `tz` helpers.
- `src/features/dashboard/sessions.ts` (`sessionsThatFitLocal`) uses `floor(block / (d + b))`. That ignores the 15-minute grid and counts **more** sessions than clients can book online: with a 35-minute session and no buffer it says 6, but only 5 are bookable. Switch it to `sessionsThatFit`.
- Pass **all** of the therapist's appointments **and** all appointments in the rooms involved to `findSlots` and `validateAppointment`. Other appointments are ignored, so passing more is safe.

## Contract suggestions (not changed; `src/lib/domain/` is not mine)
1. **`Appointment.paperWindowId: Id | null`**: the database has `paper_window_id`. Without it the engine has to infer "this window is booked" from overlap (S8), and the store cannot set the window to `filled` or back to `open` exactly.
2. **`Slot.paperWindowId?: Id | null`**: `findSlots` already returns it (`EngineSlot`), so `holdSlot` knows which window it fills.
3. **`PaperWindow.status`** in the database also has `"closed"`. The domain type has only `open | filled`. The engine treats anything other than `open` as closed.
4. The parked 3.4 booking window (`minNoticeMin` / maximum horizon) is supported by `generateSlots` and `findSlots` (`minNoticeMin`; the horizon is simply `range.end`), but `Therapist` has no field for it yet.

## Open questions
- **3.2 "intersected with their availability"** for shared-room therapists: right now a reserved block is treated as fully available, minus time off and external busy. Should a shared-room therapist also be able to set working hours that narrow their own blocks? Easy to add (intersect the block windows with the rule windows) if the owner wants it.
- **Manual bookings and time off:** `validateAppointment` checks time off only when `busy` is passed, as the database does. Should a therapist be warned, rather than refused, when entering a manual booking during their own time off?
