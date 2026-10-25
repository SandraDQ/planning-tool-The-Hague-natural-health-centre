// In-memory DataStore for demo mode (D21). Enforces the same rules as the database:
// no overlaps, shared-room appointments inside the therapist's block, blocks with
// bookings cannot be released (D14), 15-minute holds (D5), idempotent payment
// confirmation, snapshots (D6), intake kept apart and never shown to admin.

import { randomUUID } from "node:crypto";
import { DomainError, type DomainErrorCode } from "@/lib/domain/store";
import type {
  Appointment,
  BlockTemplate,
  CancellationPolicy,
  Client,
  Id,
  IntakeInput,
  Interval,
  Locale,
  RentRate,
  RoomBlock,
  Session,
  Slot,
  Therapist,
} from "@/lib/domain/types";
import type { AppStore } from "../extensions";
import { holdExpiresAt } from "@/lib/scheduling";
import { makeAppointment, sessionTypeContext } from "./build";
import { checkReleaseBlock, checkReserveBlock, findSlots, occupies, roomHasFutureBookings, validateInState } from "./rules";
import { SERIES_HORIZON_WEEKS, materializeSeries } from "./series";
import type { DemoState } from "./state";
import { MINUTE, addDays, contains, isDate, isTime, isValidInterval, iso, isoWeekday, localDateOf, localToUtcIso, ms, overlaps } from "./time";

/** Longest range findSlots / calendars may ask for in one call. */
const MAX_RANGE_DAYS = 62;

type CancelReason = "hold_expired" | "payment_failed" | "therapist" | "client";

const clone = <T>(x: T): T => structuredClone(x);
function fail(code: DomainErrorCode, message?: string): never {
  throw new DomainError(code, message);
}

const isInt = (n: unknown, min = -Infinity, max = Infinity): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const isText = (s: unknown, max = 2000): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const isEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isLocaleText = (r: unknown, required = true): r is Record<Locale, string> =>
  typeof r === "object" &&
  r !== null &&
  (["nl", "en"] as const).every((l) => {
    const v = (r as Record<string, unknown>)[l];
    return typeof v === "string" && v.length <= 5000 && (!required || v.trim().length > 0);
  });

function checkRange(range: Interval) {
  if (!range || !isValidInterval(range)) fail("invalid", "Invalid range");
  if (ms(range.end) - ms(range.start) > MAX_RANGE_DAYS * 86_400_000) fail("invalid", `Range longer than ${MAX_RANGE_DAYS} days`);
}

function checkClientInput(c: Omit<Client, "id">) {
  if (!c || !isText(c.firstName, 100) || !isText(c.lastName, 100) || !isEmail(c.email) || !isText(c.phone, 40)) {
    fail("invalid", "Name, e-mail and phone are required");
  }
  if (c.locale !== "nl" && c.locale !== "en") fail("invalid", "Unknown locale");
}

export interface DemoStoreOptions {
  /** Clock, injectable for tests. */
  now?: () => number;
}

export function createDemoStore(state: DemoState, options: DemoStoreOptions = {}): AppStore {
  const now = options.now ?? (() => Date.now());
  const cancelReasons: Record<Id, CancelReason> = {};

  // ---------- housekeeping (expire_stale_holds, series horizon) ----------

  function tick() {
    const t = now();
    for (const a of state.appointments) {
      if (a.status === "held" && a.holdExpiresAt && ms(a.holdExpiresAt) <= t) cancel(a, "hold_expired");
    }
    const until = addDays(localDateOf(t), SERIES_HORIZON_WEEKS * 7);
    if (until > state.materializedUntil) {
      for (const s of state.blockSeries) materializeSeries(state, s, until);
      state.materializedUntil = until;
    }
  }

  function cancel(a: Appointment, reason: CancelReason) {
    a.status = "cancelled";
    cancelReasons[a.id] = reason;
    // D18: intake of a booking cancelled before its session starts is purged.
    if (ms(a.session.start) > now()) state.intakes = state.intakes.filter((i) => i.appointmentId !== a.id);
    syncPaperWindow(a.paperWindowId);
  }

  /** A paper window closes once booked and reopens when freed (a "closed" window stays closed). */
  function syncPaperWindow(windowId: Id | null | undefined) {
    if (!windowId) return;
    const w = state.paperWindows.find((p) => p.id === windowId);
    if (!w || w.status === "closed") return;
    const taken = state.appointments.some((a) => occupies(a) && a.paperWindowId === windowId);
    w.status = taken ? "filled" : "open";
  }

  const timeOffOf = (therapistId: Id) => state.timeOff.filter((t) => t.therapistId === therapistId).map((t) => t.period);

  // ---------- authorisation ----------

  function asAdmin(session: Session) {
    tick();
    if (session?.role !== "admin") fail("forbidden");
  }

  function asTherapist(session: Session): Therapist {
    tick();
    if (session?.role !== "therapist" || !session.therapistId) fail("forbidden");
    const me = state.therapists.find((t) => t.id === session.therapistId);
    if (!me) fail("forbidden");
    return me!;
  }

  function asClient(session: Session): Client {
    tick();
    if (session?.role !== "client" || !session.clientId) fail("forbidden");
    const me = state.clients.find((c) => c.id === session.clientId);
    if (!me) fail("forbidden");
    return me!;
  }

  function ownAppointment(me: Therapist, id: Id): Appointment {
    const a = state.appointments.find((x) => x.id === id);
    if (!a) fail("not_found");
    if (a!.therapistId !== me.id) fail("forbidden");
    return a!;
  }

  // ---------- shared helpers ----------

  function findOrCreateClient(input: Omit<Client, "id">, createdBy?: Id): Client {
    checkClientInput(input);
    const email = input.email.trim().toLowerCase();
    // Manual bookings always get their own record; online bookings reuse a matching
    // e-mail without changing the stored details (nothing is returned to the guest).
    const existing = createdBy ? undefined : state.clients.find((c) => c.email.toLowerCase() === email);
    if (existing) return existing;
    const client: Client = {
      id: randomUUID(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone.trim(),
      locale: input.locale,
    };
    state.clients.push(client);
    if (createdBy) state.clientCreatedBy[client.id] = createdBy;
    return client;
  }

  function checkSlotShape(slot: Slot) {
    if (!slot || typeof slot.therapistId !== "string" || typeof slot.roomId !== "string" || !slot.session || !Number.isFinite(ms(slot.session.start))) {
      fail("invalid", "Invalid slot");
    }
  }

  function blockPeriod(template: BlockTemplate, date: string): Interval {
    return { start: localToUtcIso(date, template.startTime), end: localToUtcIso(date, template.endTime) };
  }

  /** Reserve one block, or a weekly series starting on `date` (therapist or admin). */
  function createBlocks(
    therapistId: Id,
    input: { roomId: Id; blockTemplateId: Id; date: string; weekly?: boolean },
    actor: "therapist" | "admin",
  ): RoomBlock[] {
    const room = state.rooms.find((r) => r.id === input?.roomId);
    if (!room || !room.active || room.kind !== "shared") fail("invalid", "Blocks can only be reserved in an active shared room");
    const template = state.blockTemplates.find((t) => t.id === input.blockTemplateId && t.active);
    if (!template) fail("invalid", "Unknown block time");
    if (!isDate(input.date)) fail("invalid", "Invalid date");
    const period = blockPeriod(template!, input.date);
    const code = checkReserveBlock(state, { roomId: room!.id, therapistId, period }, actor, now());
    if (code === "forbidden") fail("forbidden", "This block has already started");
    if (code === "block_taken") fail("block_taken", "Someone else already has this block");
    if (code) fail(code);

    if (!input.weekly) {
      const block: RoomBlock = { id: randomUUID(), roomId: room!.id, therapistId, period, seriesId: null, status: "reserved" };
      state.blocks.push(block);
      return [clone(block)];
    }
    const series = {
      id: randomUUID(),
      roomId: room!.id,
      therapistId,
      weekday: isoWeekday(input.date),
      blockTemplateId: template!.id,
      startsOn: input.date,
      endsOn: null,
    };
    state.blockSeries.push(series);
    const until = input.date > state.materializedUntil ? input.date : state.materializedUntil;
    return clone(materializeSeries(state, series, until));
  }

  function release(block: RoomBlock | undefined, actor: "therapist" | "admin") {
    if (!block) fail("not_found");
    // Expired holds were cancelled by tick() first, as pg_cron does before the DB check.
    const code = checkReleaseBlock(state, block!, actor, now());
    if (code === "block_has_appointments") fail(code, "Move or cancel the bookings in this block first");
    if (code === "forbidden") fail(code, "This block has already started");
    if (code) fail(code, "Block is already released");
    // Open paper windows inside the block go with it (Q3: they must sit inside a block).
    state.paperWindows = state.paperWindows.filter(
      (w) => !(w.status === "open" && w.therapistId === block!.therapistId && w.roomId === block!.roomId && contains(block!.period, w.period)),
    );
    block!.status = "released";
  }

  function checkPolicy(p: Omit<CancellationPolicy, "therapistId">) {
    if (!p || !isInt(p.noticeValue, 0, 720) || (p.noticeUnit !== "hours" && p.noticeUnit !== "business_days")) fail("invalid", "Invalid notice period");
    if (p.feeType === "percent" ? !isInt(p.feeValue, 0, 100) : p.feeType === "fixed" ? !isInt(p.feeValue, 0, 1_000_000) : true) {
      fail("invalid", "Invalid cancellation fee");
    }
    if (typeof p.exemptNewClients !== "boolean" || !isLocaleText(p.text, false)) fail("invalid", "Invalid policy text");
  }

  const publicTherapist = (id: Id) => state.therapists.find((t) => t.id === id && t.bookable);

  // ---------- the store ----------

  return {
    public: {
      async listTherapies() {
        tick();
        return clone(state.therapies.filter((t) => t.active));
      },
      async listBookableTherapists(filter) {
        tick();
        return clone(state.therapists.filter((t) => t.bookable && (!filter?.therapyId || t.therapyIds.includes(filter.therapyId))));
      },
      async getTherapistBySlug(slug) {
        tick();
        return clone(state.therapists.find((t) => t.slug === slug && t.bookable) ?? null);
      },
      async listServices(therapistId) {
        tick();
        if (!publicTherapist(therapistId)) return [];
        return clone(state.services.filter((s) => s.therapistId === therapistId && !s.archived));
      },
      async listSessionTypes(serviceId) {
        tick();
        const service = state.services.find((s) => s.id === serviceId && !s.archived);
        if (!service || !publicTherapist(service.therapistId)) return [];
        return clone(state.sessionTypes.filter((st) => st.serviceId === serviceId));
      },
      async getCancellationPolicy(therapistId) {
        tick();
        if (!publicTherapist(therapistId)) return null;
        return clone(state.policies.find((p) => p.therapistId === therapistId) ?? null);
      },
      async findSlots(sessionTypeId, range) {
        tick();
        checkRange(range);
        const st = state.sessionTypes.find((s) => s.id === sessionTypeId);
        if (!st) fail("not_found", "Session type not found");
        const { sessionType, service, therapist } = sessionTypeContext(state, sessionTypeId);
        if (!therapist.bookable || service.archived) return [];
        return findSlots(state, { therapist, durationMin: sessionType.durationMin, range, nowMs: now() });
      },
    },

    booking: {
      async holdSlot(input) {
        tick();
        const intake: IntakeInput = input?.intake;
        if (!intake || intake.acceptedPolicy !== true || intake.healthDataConsent !== true || !isText(intake.reason, 5000) || typeof intake.newClient !== "boolean") {
          fail("invalid", "Intake form is incomplete");
        }
        checkSlotShape(input.slot);
        checkClientInput(input.client);
        const { sessionType, service, therapist } = sessionTypeContext(state, input.sessionTypeId);
        if (!therapist.bookable || service.archived) fail("invalid", "This service cannot be booked online");
        if (input.slot.therapistId !== therapist.id) fail("invalid", "Slot belongs to another therapist");

        const start = ms(input.slot.session.start);
        const session = { start: iso(start), end: iso(start + sessionType.durationMin * MINUTE) };
        const paperWindow = therapist.paperCalendar
          ? state.paperWindows.find((p) =>
              input.slot.paperWindowId ? p.id === input.slot.paperWindowId : p.therapistId === therapist.id && p.roomId === input.slot.roomId && contains(p.period, session),
            ) ?? null
          : null;
        if (therapist.paperCalendar && !paperWindow) fail("outside_block", "This time is not available");
        // Database rules first (room layer, overlaps → slot_taken), then the slot rules
        // (working hours, grid, time off): a valid start must be one findSlots offers.
        const { code, roomBlockId } = validateInState(
          state,
          { therapistId: therapist.id, roomId: input.slot.roomId, session, bufferMinutes: therapist.bufferMinutes },
          { nowMs: now(), paperWindow, busy: timeOffOf(therapist.id) },
        );
        if (code === "slot_taken") fail("slot_taken", "Someone just took this time");
        if (code) fail(code === "forbidden" ? "outside_block" : code, "This time is not available");
        const offered = findSlots(state, { therapist, durationMin: sessionType.durationMin, range: { start: session.start, end: iso(start + 1) }, nowMs: now() }).some(
          (s) => s.roomId === input.slot.roomId && ms(s.session.start) === start,
        );
        if (!offered) fail("outside_block", "This time is not available");

        const client = findOrCreateClient(input.client);
        const appt = makeAppointment(state, {
          sessionTypeId: sessionType.id,
          roomId: input.slot.roomId,
          roomBlockId,
          paperWindowId: paperWindow?.id ?? null,
          clientId: client.id,
          start: session.start,
          status: "held",
          source: "online",
          holdExpiresAt: holdExpiresAt(now()),
        });
        state.appointments.push(appt);
        syncPaperWindow(appt.paperWindowId);
        state.intakes.push({ appointmentId: appt.id, answers: clone(intake), deleteAfter: null });
        return clone(appt);
      },

      async confirmPayment(appointmentId, paymentId) {
        tick();
        if (!isText(paymentId, 200)) fail("invalid", "Missing payment id");
        const a = state.appointments.find((x) => x.id === appointmentId);
        if (!a) fail("not_found");
        const known = state.appointmentPayment[a!.id];
        if (known) {
          if (known === paymentId) return clone(a!); // webhook retry: idempotent
          fail("invalid", "Appointment is already paid with another payment");
        }
        if (a!.status === "cancelled") fail("hold_expired", "The hold expired before payment");
        if (a!.status !== "held") fail("invalid", "Appointment is not waiting for payment");
        a!.status = "confirmed";
        a!.holdExpiresAt = null;
        state.appointmentPayment[a!.id] = paymentId;
        return clone(a!);
      },

      async failPayment(appointmentId) {
        tick();
        const a = state.appointments.find((x) => x.id === appointmentId);
        if (!a) fail("not_found");
        if (a!.status === "held") cancel(a!, "payment_failed");
      },

      async getAppointment(id) {
        tick();
        return clone(state.appointments.find((a) => a.id === id) ?? null);
      },
    },

    therapist: {
      async getMe(session) {
        return clone(asTherapist(session));
      },
      async updateMe(session, patch) {
        const me = asTherapist(session);
        const p = patch ?? {};
        if (p.bio !== undefined && !isLocaleText(p.bio, false)) fail("invalid", "Invalid bio");
        if (p.photoUrl !== undefined && p.photoUrl !== null && !(typeof p.photoUrl === "string" && /^(https:\/\/|\/)/.test(p.photoUrl))) fail("invalid", "Invalid photo");
        if (p.publicEmail !== undefined && p.publicEmail !== null && !isEmail(p.publicEmail)) fail("invalid", "Invalid e-mail");
        if (p.bufferMinutes !== undefined && !(isInt(p.bufferMinutes, 0, 240) && p.bufferMinutes % 5 === 0)) fail("invalid", "Buffer must be 0–240 minutes in steps of 5");
        if (p.reminderHours !== undefined && !isInt(p.reminderHours, 0, 168)) fail("invalid", "Invalid reminder time");
        if (p.intakeRetentionDays !== undefined && p.intakeRetentionDays !== null && !isInt(p.intakeRetentionDays, 1, 3650)) fail("invalid", "Invalid retention period");
        for (const k of ["bio", "photoUrl", "publicEmail", "bufferMinutes", "reminderHours", "intakeRetentionDays"] as const) {
          if (p[k] !== undefined) (me as unknown as Record<string, unknown>)[k] = clone(p[k]);
        }
        return clone(me);
      },
      async listMyAppointments(session, range) {
        const me = asTherapist(session);
        checkRange(range);
        return clone(
          state.appointments
            .filter((a) => a.therapistId === me.id && overlaps(a.session, range))
            .sort((a, b) => ms(a.session.start) - ms(b.session.start)),
        );
      },
      async listMyBlocks(session, range) {
        const me = asTherapist(session);
        checkRange(range);
        return clone(
          state.blocks
            .filter((b) => b.therapistId === me.id && b.status === "reserved" && overlaps(b.period, range))
            .sort((a, b) => ms(a.period.start) - ms(b.period.start)),
        );
      },
      async listClients(session, ids) {
        const me = asTherapist(session);
        const wanted = new Set(Array.isArray(ids) ? ids : []);
        const mine = new Set([
          ...state.appointments.filter((a) => a.therapistId === me.id).map((a) => a.clientId),
          ...Object.entries(state.clientCreatedBy)
            .filter(([, by]) => by === me.id)
            .map(([id]) => id),
        ]);
        return clone(state.clients.filter((c) => wanted.has(c.id) && mine.has(c.id)));
      },
      async reserveBlock(session, input) {
        const me = asTherapist(session);
        return createBlocks(me.id, input, "therapist");
      },
      async releaseBlock(session, blockId) {
        const me = asTherapist(session);
        const block = state.blocks.find((b) => b.id === blockId);
        if (block && block.therapistId !== me.id) fail("forbidden");
        release(block, "therapist");
      },
      async addManualBooking(session, input) {
        const me = asTherapist(session);
        checkSlotShape(input?.slot);
        const { sessionType, therapist } = sessionTypeContext(state, input.sessionTypeId);
        if (therapist.id !== me.id) fail("forbidden", "Session type belongs to another therapist");
        if (input.slot.therapistId !== me.id) fail("forbidden");
        const start = ms(input.slot.session.start);
        if (start % MINUTE !== 0) fail("invalid", "Start must be on a whole minute");
        const period = { start: iso(start), end: iso(start + sessionType.durationMin * MINUTE) };
        // D25: time off does not block a manual booking (the therapist decides).
        const { code, roomBlockId } = validateInState(
          state,
          { therapistId: me.id, roomId: input.slot.roomId, session: period, bufferMinutes: me.bufferMinutes },
          { nowMs: now() },
        );
        if (code === "slot_taken") fail(code, "This time overlaps another booking");
        if (code) fail(code);
        // A manual booking inside an open paper window takes that window.
        const w = state.paperWindows.find((p) => p.therapistId === me.id && p.status === "open" && p.roomId === input.slot.roomId && overlaps(p.period, period));
        const client = findOrCreateClient(input.client, me.id);
        const appt = makeAppointment(state, {
          sessionTypeId: sessionType.id,
          roomId: input.slot.roomId,
          roomBlockId,
          paperWindowId: w?.id ?? null,
          clientId: client.id,
          start: period.start,
          status: "confirmed",
          source: "manual",
          holdExpiresAt: null,
        });
        state.appointments.push(appt);
        syncPaperWindow(appt.paperWindowId);
        return clone(appt);
      },
      async cancelAppointment(session, appointmentId, by) {
        const me = asTherapist(session);
        if (by !== "therapist") fail("invalid");
        const a = ownAppointment(me, appointmentId);
        if (!occupies(a)) fail("invalid", "Only held or confirmed appointments can be cancelled");
        cancel(a, "therapist");
        return clone(a);
      },
      async markNoShow(session, appointmentId) {
        const me = asTherapist(session);
        const a = ownAppointment(me, appointmentId);
        if (a.status !== "confirmed" && a.status !== "completed") fail("invalid", "Only confirmed appointments can be marked as no-show");
        if (ms(a.session.start) > now()) fail("invalid", "The session has not started yet");
        a.status = "no_show";
        return clone(a);
      },
      async recordBalancePayment(session, input) {
        const me = asTherapist(session);
        const a = ownAppointment(me, input?.appointmentId);
        if (!["cash", "pin", "transfer", "tikkie"].includes(input.method)) fail("invalid", "Unknown payment method");
        if (!isInt(input.amountCents, 1, 10_000_000)) fail("invalid", "Amount must be a positive number of cents");
        if (!isDate(input.paidOn)) fail("invalid", "Invalid date");
        if (a.status === "held" || a.status === "cancelled") fail("invalid", "This appointment has no balance to pay");
        const payment = { id: randomUUID(), appointmentId: a.id, method: input.method, amountCents: input.amountCents, paidOn: input.paidOn };
        state.balancePayments.push(payment);
        return clone(payment);
      },
      async listMyServices(session) {
        const me = asTherapist(session);
        return clone(state.services.filter((s) => s.therapistId === me.id));
      },
      async upsertService(session, service) {
        const me = asTherapist(session);
        if (!service || !isLocaleText(service.name) || !isLocaleText(service.description, false)) fail("invalid", "Name is required in Dutch and English");
        if (!me.therapyIds.includes(service.therapyId) || !state.therapies.some((t) => t.id === service.therapyId && t.active)) {
          fail("invalid", "Choose one of your therapies");
        }
        const depositOk =
          service.depositType === "fixed" ? isInt(service.depositValue, 100, 10_000_000) : service.depositType === "percent" ? isInt(service.depositValue, 1, 100) : false;
        if (!depositOk) fail("invalid", "Deposit must be at least € 1, or 1–100%");
        if (typeof service.archived !== "boolean") fail("invalid");
        const fields = {
          therapyId: service.therapyId,
          name: clone(service.name),
          description: clone(service.description),
          depositType: service.depositType,
          depositValue: service.depositValue,
          archived: service.archived,
        };
        if (service.id) {
          const existing = state.services.find((s) => s.id === service.id);
          if (!existing) fail("not_found");
          if (existing!.therapistId !== me.id) fail("forbidden");
          Object.assign(existing!, fields);
          return clone(existing!);
        }
        const created = { id: randomUUID(), therapistId: me.id, ...fields };
        state.services.push(created);
        return clone(created);
      },
      async upsertSessionType(session, st) {
        const me = asTherapist(session);
        const service = state.services.find((s) => s.id === st?.serviceId);
        if (!service) fail("not_found", "Service not found");
        if (service!.therapistId !== me.id) fail("forbidden");
        if (!isLocaleText(st.name)) fail("invalid", "Name is required in Dutch and English");
        if (!(isInt(st.durationMin, 5, 720) && st.durationMin % 5 === 0)) fail("invalid", "Duration must be in steps of 5 minutes");
        if (!isInt(st.priceCents, 0, 10_000_000)) fail("invalid", "Invalid price");
        const fields = { serviceId: service!.id, name: clone(st.name), durationMin: st.durationMin, priceCents: st.priceCents };
        if (st.id) {
          const existing = state.sessionTypes.find((x) => x.id === st.id);
          if (!existing) fail("not_found");
          const owner = state.services.find((s) => s.id === existing!.serviceId);
          if (owner?.therapistId !== me.id) fail("forbidden");
          Object.assign(existing!, fields); // booked appointments keep their snapshot (D6)
          return clone(existing!);
        }
        const created = { id: randomUUID(), ...fields };
        state.sessionTypes.push(created);
        return clone(created);
      },
      async listAvailability(session) {
        const me = asTherapist(session);
        return clone(state.availability.filter((r) => r.therapistId === me.id));
      },
      async setAvailability(session, rules) {
        const me = asTherapist(session);
        if (!Array.isArray(rules)) fail("invalid");
        for (const r of rules) {
          if (!isInt(r?.weekday, 1, 7) || !isTime(r.startTime) || !isTime(r.endTime) || r.startTime >= r.endTime) fail("invalid", "Invalid working hours");
        }
        for (const a of rules) {
          for (const b of rules) {
            if (a !== b && a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) fail("invalid", "Working hours overlap");
          }
        }
        state.availability = state.availability.filter((r) => r.therapistId !== me.id);
        const created = rules.map((r) => ({ id: randomUUID(), therapistId: me.id, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));
        state.availability.push(...created);
        return clone(created);
      },
      async addTimeOff(session, period, note) {
        const me = asTherapist(session);
        if (!period || !isValidInterval(period)) fail("invalid", "Invalid period");
        if (note !== undefined && typeof note !== "string") fail("invalid");
        const row = { id: randomUUID(), therapistId: me.id, period: { start: iso(ms(period.start)), end: iso(ms(period.end)) }, note: note?.slice(0, 500) || null };
        state.timeOff.push(row);
        return clone(row);
      },
      async getMyPolicy(session) {
        const me = asTherapist(session);
        return clone(state.policies.find((p) => p.therapistId === me.id) ?? null);
      },
      async setMyPolicy(session, policy) {
        const me = asTherapist(session);
        checkPolicy(policy);
        const row: CancellationPolicy = { ...clone(policy), therapistId: me.id };
        state.policies = [...state.policies.filter((p) => p.therapistId !== me.id), row];
        return clone(row);
      },
      async getMyBusiness(session) {
        const me = asTherapist(session);
        return clone(state.business.find((b) => b.therapistId === me.id) ?? null);
      },
      async listRooms(session) {
        const me = asTherapist(session);
        return state.rooms
          .filter((r) => r.active)
          .map((r) => ({ ...clone(r), privateTherapistId: r.privateTherapistId === me.id ? me.id : null }));
      },
      async listBlockTemplates(session) {
        asTherapist(session);
        return clone(state.blockTemplates.filter((t) => t.active));
      },
      async listTakenBlocks(session, range) {
        const me = asTherapist(session);
        checkRange(range);
        const shared = new Set(state.rooms.filter((r) => r.kind === "shared").map((r) => r.id));
        return state.blocks
          .filter((b) => b.status === "reserved" && shared.has(b.roomId) && overlaps(b.period, range))
          .sort((a, b) => ms(a.period.start) - ms(b.period.start))
          .map((b) => ({ id: b.id, roomId: b.roomId, period: clone(b.period), mine: b.therapistId === me.id }));
      },
      // ----- extras (see ../extensions.ts) -----
      async listMySessionTypes(session) {
        const me = asTherapist(session);
        const own = new Set(state.services.filter((s) => s.therapistId === me.id).map((s) => s.id));
        return clone(state.sessionTypes.filter((st) => own.has(st.serviceId)));
      },
      async listMyTimeOff(session) {
        const me = asTherapist(session);
        return clone(state.timeOff.filter((t) => t.therapistId === me.id));
      },
      async readIntake(session, appointmentId) {
        const me = asTherapist(session);
        ownAppointment(me, appointmentId);
        return clone(state.intakes.find((i) => i.appointmentId === appointmentId)?.answers ?? null);
      },
      async listMyPaperWindows(session) {
        const me = asTherapist(session);
        return clone(state.paperWindows.filter((w) => w.therapistId === me.id));
      },
    },

    admin: {
      async listRooms(session) {
        asAdmin(session);
        return clone([...state.rooms].sort((a, b) => a.number - b.number));
      },
      async upsertRoom(session, room) {
        asAdmin(session);
        if (!room || !isInt(room.number, 1, 999) || !isText(room.name, 100) || (room.kind !== "private" && room.kind !== "shared") || typeof room.active !== "boolean") {
          fail("invalid", "Invalid room");
        }
        const privateTherapistId = room.kind === "private" ? room.privateTherapistId ?? null : null;
        if (privateTherapistId && !state.therapists.some((t) => t.id === privateTherapistId)) fail("invalid", "Unknown therapist");
        if (state.rooms.some((r) => r.number === room.number && r.id !== room.id)) fail("invalid", "Room number already in use");
        const fields = { number: room.number, name: room.name.trim(), kind: room.kind, active: room.active, privateTherapistId };
        if (room.id) {
          const existing = state.rooms.find((r) => r.id === room.id);
          if (!existing) fail("not_found");
          const layerChanges =
            existing!.kind !== fields.kind || existing!.privateTherapistId !== fields.privateTherapistId || (existing!.active && !fields.active);
          // D14: a room with future bookings cannot be made private, reassigned or deactivated.
          if (layerChanges && roomHasFutureBookings(state, existing!.id, now())) {
            fail("block_has_appointments", "Move or cancel this room's future bookings first");
          }
          if (existing!.kind === "shared" && fields.kind === "private") {
            const futureBlocks = state.blocks.some((b) => b.roomId === existing!.id && b.status === "reserved" && ms(b.period.end) > now());
            if (futureBlocks) fail("invalid", "Release this room's future blocks first");
          }
          Object.assign(existing!, fields);
          return clone(existing!);
        }
        const created = { id: randomUUID(), ...fields };
        state.rooms.push(created);
        return clone(created);
      },
      async listBlockTemplates(session) {
        asAdmin(session);
        return clone([...state.blockTemplates].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      },
      async upsertBlockTemplate(session, t) {
        asAdmin(session);
        if (!t || !isTime(t.startTime) || !isTime(t.endTime) || t.startTime >= t.endTime || typeof t.active !== "boolean") fail("invalid", "Invalid block time");
        if (state.blockTemplates.some((x) => x.id !== t.id && x.startTime === t.startTime && x.endTime === t.endTime)) fail("invalid", "This block time already exists");
        const fields = { startTime: t.startTime, endTime: t.endTime, active: t.active };
        if (t.id) {
          const existing = state.blockTemplates.find((x) => x.id === t.id);
          if (!existing) fail("not_found");
          Object.assign(existing!, fields); // existing blocks keep their times
          return clone(existing!);
        }
        const created = { id: randomUUID(), ...fields };
        state.blockTemplates.push(created);
        return clone(created);
      },
      async listTherapists(session) {
        asAdmin(session);
        return clone(state.therapists);
      },
      async inviteTherapist(session, input) {
        asAdmin(session);
        if (!input || !isText(input.displayName, 120) || !isEmail(input.email) || !Array.isArray(input.therapyIds)) fail("invalid", "Name and e-mail are required");
        if (!input.therapyIds.every((id) => state.therapies.some((t) => t.id === id))) fail("invalid", "Unknown therapy");
        const email = input.email.trim().toLowerCase();
        if (Object.values(state.therapistLoginEmails).includes(email)) fail("invalid", "This e-mail address is already invited");
        const base = input.displayName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "therapeut";
        let slug = base;
        for (let i = 2; state.therapists.some((t) => t.slug === slug); i++) slug = `${base}-${i}`;
        const therapist: Therapist = {
          id: randomUUID(),
          slug,
          displayName: input.displayName.trim(),
          bio: { nl: "", en: "" },
          photoUrl: null,
          publicEmail: null,
          therapyIds: [...new Set(input.therapyIds)],
          bookable: false,
          paperCalendar: false,
          bufferMinutes: 0,
          reminderHours: 24,
          intakeRetentionDays: null,
          onboardingStatus: "invited",
        };
        state.therapists.push(therapist);
        state.therapistLoginEmails[therapist.id] = email; // demo: no e-mail is sent
        return clone(therapist);
      },
      async updateTherapist(session, id, patch) {
        asAdmin(session);
        const t = state.therapists.find((x) => x.id === id);
        if (!t) fail("not_found");
        const p = patch ?? {};
        if (p.displayName !== undefined && !isText(p.displayName, 120)) fail("invalid", "Invalid name");
        if (p.therapyIds !== undefined && !(Array.isArray(p.therapyIds) && p.therapyIds.every((x) => state.therapies.some((th) => th.id === x)))) {
          fail("invalid", "Unknown therapy");
        }
        if (p.paperCalendar !== undefined && typeof p.paperCalendar !== "boolean") fail("invalid");
        if (p.bookable !== undefined && typeof p.bookable !== "boolean") fail("invalid");
        if (p.displayName !== undefined) t!.displayName = p.displayName.trim();
        if (p.therapyIds !== undefined) t!.therapyIds = [...new Set(p.therapyIds)];
        if (p.paperCalendar !== undefined) t!.paperCalendar = p.paperCalendar;
        if (p.bookable !== undefined) t!.bookable = p.bookable;
        return clone(t!);
      },
      async getBusiness(session, therapistId) {
        asAdmin(session);
        return clone(state.business.find((b) => b.therapistId === therapistId) ?? null);
      },
      async setBusiness(session, business) {
        asAdmin(session);
        if (!business || !state.therapists.some((t) => t.id === business.therapistId)) fail("not_found", "Unknown therapist");
        if (!isText(business.legalName, 200) || typeof business.kor !== "boolean") fail("invalid", "Legal name is required");
        const optional = (v: unknown) => v === null || (typeof v === "string" && v.length <= 300);
        if (![business.tradeName, business.address, business.kvk, business.btwNumber].every(optional)) fail("invalid");
        const row = clone(business);
        state.business = [...state.business.filter((b) => b.therapistId !== row.therapistId), row];
        return clone(row);
      },
      async listTherapies(session) {
        asAdmin(session);
        return clone(state.therapies);
      },
      async upsertTherapy(session, t) {
        asAdmin(session);
        if (!t || !isLocaleText(t.name) || typeof t.active !== "boolean") fail("invalid", "Name is required in Dutch and English");
        if (t.id) {
          const existing = state.therapies.find((x) => x.id === t.id);
          if (!existing) fail("not_found");
          existing!.name = clone(t.name);
          existing!.active = t.active;
          return clone(existing!);
        }
        const created = { id: randomUUID(), name: clone(t.name), active: t.active };
        state.therapies.push(created);
        return clone(created);
      },
      async listRentRates(session) {
        asAdmin(session);
        return clone(state.rentRates);
      },
      async upsertRentRate(session, rate) {
        asAdmin(session);
        if (!rate || (rate.pricingMode !== "fixed_monthly" && rate.pricingMode !== "per_block")) fail("invalid", "Invalid pricing mode");
        if (rate.roomId !== null && !state.rooms.some((r) => r.id === rate.roomId)) fail("invalid", "Unknown room");
        if (rate.roomId === null && rate.pricingMode !== "per_block") fail("invalid", "The default rate is a per-block rate");
        if (!isInt(rate.amountCents, 0, 100_000_000)) fail("invalid", "Invalid amount");
        if (!["21", "9", "exempt"].includes(rate.btwTreatment)) fail("invalid", "Invalid BTW treatment");
        if (!isDate(rate.validFrom) || (rate.validTo !== null && (!isDate(rate.validTo) || rate.validTo < rate.validFrom))) fail("invalid", "Invalid dates");
        const end = (r: Pick<RentRate, "validTo">) => r.validTo ?? "9999-12-31";
        const clash = state.rentRates.some(
          (r) => r.id !== rate.id && r.roomId === rate.roomId && r.validFrom <= end(rate) && rate.validFrom <= end(r),
        );
        if (clash) fail("invalid", "Rates of the same room may not overlap in time");
        const fields = {
          roomId: rate.roomId,
          pricingMode: rate.pricingMode,
          amountCents: rate.amountCents,
          btwTreatment: rate.btwTreatment,
          validFrom: rate.validFrom,
          validTo: rate.validTo,
        };
        if (rate.id) {
          const existing = state.rentRates.find((r) => r.id === rate.id);
          if (!existing) fail("not_found");
          Object.assign(existing!, fields);
          return clone(existing!);
        }
        const created = { id: randomUUID(), ...fields };
        state.rentRates.push(created);
        return clone(created);
      },
      async getRentSettings(session) {
        asAdmin(session);
        return clone(state.rentSettings);
      },
      async setRentSettings(session, s) {
        asAdmin(session);
        if (!s || !isInt(s.billingDay, 1, 28) || !isInt(s.paymentTermDays, 0, 90) || typeof s.autoSend !== "boolean") fail("invalid", "Invalid rent settings");
        state.rentSettings = { billingDay: s.billingDay, paymentTermDays: s.paymentTermDays, autoSend: s.autoSend };
        return clone(state.rentSettings);
      },
      async roomGrid(session, range) {
        asAdmin(session);
        checkRange(range);
        // Appointments carry no intake: intake lives in state.intakes and is never read here.
        return clone({
          rooms: [...state.rooms].sort((a, b) => a.number - b.number),
          blocks: state.blocks.filter((b) => b.status === "reserved" && overlaps(b.period, range)),
          appointments: state.appointments.filter((a) => a.status !== "cancelled" && overlaps(a.session, range)),
        });
      },
      async listBlockSeries(session) {
        asAdmin(session);
        return clone(state.blockSeries);
      },
      async assignBlock(session, input) {
        asAdmin(session);
        if (!state.therapists.some((t) => t.id === input?.therapistId)) fail("invalid", "Unknown therapist");
        return createBlocks(input.therapistId, input, "admin");
      },
      async releaseBlock(session, blockId) {
        asAdmin(session);
        release(state.blocks.find((b) => b.id === blockId), "admin");
      },
      async openPaperWindow(session, input) {
        asAdmin(session);
        const therapist = state.therapists.find((t) => t.id === input?.therapistId);
        if (!therapist) fail("invalid", "Unknown therapist");
        if (!therapist!.paperCalendar) fail("invalid", "This therapist does not use a paper calendar");
        const room = state.rooms.find((r) => r.id === input.roomId && r.active);
        if (!room) fail("invalid", "Room is not available");
        if (!input.period || !isValidInterval(input.period)) fail("invalid", "Invalid period");
        const period = { start: iso(ms(input.period.start)), end: iso(ms(input.period.end)) };
        if (ms(period.start) <= now()) fail("invalid", "The window must be in the future");
        if (room!.kind === "shared") {
          if (!state.blocks.some((b) => b.status === "reserved" && b.therapistId === therapist!.id && b.roomId === room!.id && contains(b.period, period))) {
            fail("outside_block", "The window must lie inside a block this therapist holds");
          }
        } else if (room!.privateTherapistId !== therapist!.id) {
          fail("outside_block", "This private room is not assigned to the therapist");
        }
        if (state.paperWindows.some((w) => w.therapistId === therapist!.id && overlaps(w.period, period))) fail("invalid", "Overlaps another window");
        const w = { id: randomUUID(), therapistId: therapist!.id, roomId: room!.id, period, status: "open" as const };
        state.paperWindows.push(w);
        return clone(w);
      },
      async listPaperWindows(session) {
        asAdmin(session);
        return clone(state.paperWindows);
      },
    },

    client: {
      async getMe(session) {
        return clone(asClient(session));
      },
      async listMyAppointments(session) {
        const me = asClient(session);
        return clone(state.appointments.filter((a) => a.clientId === me.id).sort((a, b) => ms(b.session.start) - ms(a.session.start)));
      },
    },
  };
}
