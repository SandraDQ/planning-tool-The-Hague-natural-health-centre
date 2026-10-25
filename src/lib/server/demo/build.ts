// Builds appointment rows with their frozen snapshot (D6), like the DB triggers do.

import { randomUUID } from "node:crypto";
import { DomainError } from "@/lib/domain/store";
import type { Appointment, Id, Interval, Iso } from "@/lib/domain/types";
import { depositCents } from "./rules";
import type { DemoState } from "./state";
import { MINUTE, iso, ms } from "./time";

export function sessionTypeContext(state: DemoState, sessionTypeId: Id) {
  const sessionType = state.sessionTypes.find((s) => s.id === sessionTypeId);
  const service = sessionType && state.services.find((s) => s.id === sessionType.serviceId);
  const therapist = service && state.therapists.find((t) => t.id === service.therapistId);
  if (!sessionType || !service || !therapist) throw new DomainError("not_found", "Session type not found");
  return { sessionType, service, therapist };
}

export function makeAppointment(
  state: DemoState,
  input: {
    sessionTypeId: Id;
    roomId: Id;
    roomBlockId: Id | null;
    paperWindowId?: Id | null;
    clientId: Id;
    start: Iso;
    status: Appointment["status"];
    source: Appointment["source"];
    holdExpiresAt: Iso | null;
  },
): Appointment {
  const { sessionType, service, therapist } = sessionTypeContext(state, input.sessionTypeId);
  const start = ms(input.start);
  const session: Interval = { start: iso(start), end: iso(start + sessionType.durationMin * MINUTE) };
  const occupied: Interval = { start: session.start, end: iso(start + (sessionType.durationMin + therapist.bufferMinutes) * MINUTE) };
  return {
    id: randomUUID(),
    therapistId: therapist.id,
    roomId: input.roomId,
    roomBlockId: input.roomBlockId,
    paperWindowId: input.paperWindowId ?? null,
    clientId: input.clientId,
    sessionTypeId: sessionType.id,
    session,
    occupied,
    status: input.status,
    holdExpiresAt: input.holdExpiresAt,
    source: input.source,
    snapshot: {
      serviceName: { ...service.name },
      sessionTypeName: { ...sessionType.name },
      durationMin: sessionType.durationMin,
      priceCents: sessionType.priceCents,
      depositCents: depositCents(service, sessionType.priceCents, input.source === "online"),
      bufferMinutes: therapist.bufferMinutes,
    },
  };
}
