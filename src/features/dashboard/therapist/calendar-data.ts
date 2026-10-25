import "server-only";
import type { Appointment, BalancePayment, Client, Interval, Room, Service, Session, SessionType } from "@/lib/domain/types";
import { getStore } from "@/lib/server/data";
import { addDays, isoWeekday, localDay, localToIso, weekDays, weekRange } from "../time";

/** A stretch of time the therapist can work in: a reserved block or private-room working hours. */
export type CalendarWindow = {
  key: string;
  kind: "block" | "hours";
  day: string;
  roomId: string;
  roomNumber: number;
  blockId: string | null;
  seriesId: string | null;
  start: string;
  end: string;
};

export type CalendarAppointment = Appointment & {
  roomNumber: number | null;
  client: Pick<Client, "firstName" | "lastName" | "email" | "phone"> | null;
  /** Balance payments recorded so far, oldest first. */
  payments: BalancePayment[];
};

export type CalendarData = {
  therapistId: string;
  monday: string;
  days: string[];
  windows: CalendarWindow[];
  appointments: CalendarAppointment[];
  timeOff: Interval[];
  services: Service[];
  sessionTypes: SessionType[];
  bufferMinutes: number;
  privateRoom: Pick<Room, "id" | "number"> | null;
};

export async function loadCalendarData(session: Session, monday: string): Promise<CalendarData> {
  const store = getStore().therapist;
  const range = weekRange(monday);
  const [me, appointments, blocks, rooms, availability, services, sessionTypes, timeOff] = await Promise.all([
    store.getMe(session),
    store.listMyAppointments(session, range),
    store.listMyBlocks(session, range),
    store.listRooms(session),
    store.listAvailability(session),
    store.listMyServices(session),
    store.listMySessionTypes(session),
    store.listMyTimeOff(session),
  ]);
  const clientIds = [...new Set(appointments.map((a) => a.clientId))];
  const appointmentIds = appointments.map((a) => a.id);
  const [clients, payments] = await Promise.all([
    clientIds.length ? store.listClients(session, clientIds) : Promise.resolve([]),
    appointmentIds.length ? store.listBalancePayments(session, appointmentIds) : Promise.resolve([]),
  ]);
  const paymentsByAppointment = new Map<string, BalancePayment[]>();
  for (const p of payments) paymentsByAppointment.set(p.appointmentId, [...(paymentsByAppointment.get(p.appointmentId) ?? []), p]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const privateRoom = rooms.find((r) => r.kind === "private" && r.privateTherapistId === me.id) ?? null;
  const days = weekDays(monday);

  const windows: CalendarWindow[] = blocks
    .filter((b) => b.status === "reserved")
    .map((b) => ({
      key: b.id,
      kind: "block" as const,
      day: localDay(b.period.start),
      roomId: b.roomId,
      roomNumber: roomById.get(b.roomId)?.number ?? 0,
      blockId: b.id,
      seriesId: b.seriesId,
      start: b.period.start,
      end: b.period.end,
    }));
  if (privateRoom) {
    for (const day of days) {
      for (const rule of availability.filter((r) => r.weekday === isoWeekday(day))) {
        windows.push({
          key: `${rule.id}:${day}`,
          kind: "hours",
          day,
          roomId: privateRoom.id,
          roomNumber: privateRoom.number,
          blockId: null,
          seriesId: null,
          start: localToIso(day, rule.startTime),
          end: rule.endTime === "24:00" ? localToIso(addDays(day, 1), "00:00") : localToIso(day, rule.endTime),
        });
      }
    }
  }

  return {
    therapistId: me.id,
    monday,
    days,
    windows: windows.sort((a, b) => a.start.localeCompare(b.start)),
    appointments: appointments.map((a) => {
      const c = clientById.get(a.clientId);
      return {
        ...a,
        roomNumber: roomById.get(a.roomId)?.number ?? null,
        client: c ? { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone } : null,
        payments: (paymentsByAppointment.get(a.id) ?? []).sort((x, y) => x.paidOn.localeCompare(y.paidOn)),
      };
    }),
    timeOff: timeOff.map((x) => x.period).filter((p) => p.start < range.end && p.end > range.start),
    services,
    sessionTypes,
    bufferMinutes: me.bufferMinutes,
    privateRoom: privateRoom ? { id: privateRoom.id, number: privateRoom.number } : null,
  };
}
