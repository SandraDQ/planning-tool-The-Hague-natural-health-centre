// Made-up week for the therapist calendar mock-up (one acupuncturist, shared rooms).
export type Appointment = {
  start: string;
  end: string;
  /** First name only (MASTER_PROMPT 7A privacy). */
  name: string;
  service: "acuFirst" | "acuFollow" | "short";
  status: "confirmed" | "held";
  manual?: boolean;
};
export type RoomBlock = { room: number; start: string; end: string; appointments: Appointment[] };
export type CalendarDay = { date: string; blocks: RoomBlock[] };

export const week: CalendarDay[] = [
  {
    date: "2026-11-02",
    blocks: [
      {
        room: 1,
        start: "13:00",
        end: "17:00",
        appointments: [
          { start: "13:00", end: "14:00", name: "Eva", service: "acuFirst", status: "confirmed" },
          { start: "15:30", end: "16:15", name: "Jan", service: "acuFollow", status: "confirmed" },
        ],
      },
    ],
  },
  {
    date: "2026-11-03",
    blocks: [
      {
        room: 2,
        start: "08:00",
        end: "12:00",
        appointments: [
          { start: "08:00", end: "09:00", name: "Anna", service: "acuFirst", status: "confirmed" },
          { start: "09:15", end: "10:00", name: "Mark", service: "acuFollow", status: "confirmed" },
          { start: "10:30", end: "11:30", name: "Lotte", service: "acuFirst", status: "held" },
        ],
      },
      {
        room: 5,
        start: "13:00",
        end: "17:00",
        appointments: [
          { start: "13:00", end: "13:30", name: "Sami", service: "short", status: "confirmed", manual: true },
          { start: "14:00", end: "15:00", name: "Noor", service: "acuFirst", status: "confirmed" },
        ],
      },
    ],
  },
  { date: "2026-11-04", blocks: [] },
  {
    date: "2026-11-05",
    blocks: [
      {
        room: 2,
        start: "08:00",
        end: "12:00",
        appointments: [{ start: "09:00", end: "10:00", name: "Iris", service: "acuFirst", status: "confirmed" }],
      },
    ],
  },
  {
    date: "2026-11-06",
    blocks: [
      {
        room: 1,
        start: "13:00",
        end: "17:00",
        appointments: [
          { start: "13:00", end: "13:45", name: "Tom", service: "acuFollow", status: "confirmed" },
          { start: "14:00", end: "15:00", name: "Fleur", service: "acuFirst", status: "confirmed" },
          { start: "15:15", end: "16:00", name: "Ravi", service: "acuFollow", status: "confirmed" },
        ],
      },
    ],
  },
  {
    date: "2026-11-07",
    blocks: [
      {
        room: 5,
        start: "08:00",
        end: "12:00",
        appointments: [{ start: "10:00", end: "10:30", name: "Maud", service: "short", status: "confirmed" }],
      },
    ],
  },
  { date: "2026-11-08", blocks: [] },
];

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const BUFFER_MIN = 15;
/** Length of the therapist's standard session, used for "room for N more". */
export const STANDARD_MIN = 60;

/** Free gaps inside a block (after each appointment's buffer) long enough for the shortest session. */
export function freeGaps(block: RoomBlock, shortestMin = 30) {
  const gaps: { start: number; end: number; fits: number }[] = [];
  let cursor = toMinutes(block.start);
  for (const a of block.appointments) {
    const s = toMinutes(a.start);
    if (s - cursor >= shortestMin + BUFFER_MIN) gaps.push({ start: cursor, end: s, fits: Math.floor((s - cursor) / (STANDARD_MIN + BUFFER_MIN)) });
    cursor = Math.max(cursor, toMinutes(a.end) + BUFFER_MIN);
  }
  const end = toMinutes(block.end);
  if (end - cursor >= shortestMin) gaps.push({ start: cursor, end, fits: Math.floor((end - cursor + BUFFER_MIN) / (STANDARD_MIN + BUFFER_MIN)) });
  return gaps;
}

export const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
