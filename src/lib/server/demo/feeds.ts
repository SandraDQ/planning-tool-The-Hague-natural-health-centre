// Calendar-feed events from demo state (7A). External calendars get the client's
// first name and the service only, never the complaint or intake.

import type { Interval, Locale } from "@/lib/domain/types";
import type { FeedEvent } from "../calendar-feed/ics";
import type { FeedSubject } from "../calendar-feed/token";
import type { DemoState } from "./state";
import { overlaps } from "./time";

const SHOWN = new Set(["confirmed", "completed", "no_show"]);

const words = {
  nl: { room: "Kamer", block: "Kamerblok", paper: "Papieren agenda", centre: "The Hague Natural Health Centre", minutes: "min" },
  en: { room: "Room", block: "Room block", paper: "Paper calendar", centre: "The Hague Natural Health Centre", minutes: "min" },
} as const;

export function feedEvents(state: DemoState, subject: FeedSubject, range: Interval, locale: Locale): FeedEvent[] {
  const w = words[locale];
  const roomName = (id: string) => {
    const room = state.rooms.find((r) => r.id === id);
    return room ? `${w.room} ${room.number}` : w.room;
  };
  const location = (roomId: string) => `${roomName(roomId)}, ${w.centre}`;
  const therapistName = (id: string) => state.therapists.find((t) => t.id === id)?.displayName ?? "";
  const reservedBlocks = state.blocks.filter((b) => b.status === "reserved" && overlaps(b.period, range));
  const events: FeedEvent[] = [];

  if (subject.kind === "therapist") {
    for (const a of state.appointments) {
      if (a.therapistId !== subject.id || !SHOWN.has(a.status) || !overlaps(a.session, range)) continue;
      const first = state.clients.find((c) => c.id === a.clientId)?.firstName?.trim();
      const service = a.snapshot.serviceName[locale];
      events.push({
        uid: `appointment-${a.id}`,
        start: a.session.start,
        end: a.session.end,
        title: first ? `${first} — ${service}` : service,
        description: `${a.snapshot.sessionTypeName[locale]} · ${a.snapshot.durationMin} ${w.minutes}`,
        location: location(a.roomId),
      });
    }
    for (const b of reservedBlocks) {
      if (b.therapistId !== subject.id) continue;
      events.push({ uid: `block-${b.id}`, start: b.period.start, end: b.period.end, title: `${w.block} · ${roomName(b.roomId)}`, location: location(b.roomId) });
    }
  } else {
    // Admin: who uses which room and when; no client details.
    for (const b of reservedBlocks) {
      events.push({
        uid: `block-${b.id}`,
        start: b.period.start,
        end: b.period.end,
        title: `${roomName(b.roomId)} — ${therapistName(b.therapistId)}`,
        location: location(b.roomId),
      });
    }
    for (const p of state.paperWindows) {
      if (p.status === "closed" || !overlaps(p.period, range)) continue;
      events.push({
        uid: `paper-${p.id}`,
        start: p.period.start,
        end: p.period.end,
        title: `${w.paper} · ${roomName(p.roomId)} — ${therapistName(p.therapistId)}`,
        location: location(p.roomId),
      });
    }
  }
  return events.sort((x, y) => x.start.localeCompare(y.start));
}
