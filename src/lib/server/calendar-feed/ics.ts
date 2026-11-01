// iCalendar (RFC 5545) for the one-way calendar feed (7A). Pure, so it can be unit tested.

export interface FeedEvent {
  /** Stable per event, so calendars update instead of duplicating. */
  uid: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  title: string;
  description?: string;
  location?: string;
}

/** 2026-11-02T08:30:00.000Z → 20261102T083000Z */
export function icsDate(isoUtc: string): string {
  return new Date(isoUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8 safe), continuation lines start with a space. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose one octet to the leading space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(events: FeedEvent[], options: { calendarName: string; nowIso: string }): string {
  const stamp = icsDate(options.nowIso);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Hague Natural Health Centre//Planning//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(options.calendarName)}`,
    "X-WR-TIMEZONE:Europe/Amsterdam",
    // Ask calendar apps to check for changes every 15 minutes (most poll less often anyway).
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@thehague-naturalhealthcentre.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsText(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
