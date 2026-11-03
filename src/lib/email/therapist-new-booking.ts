// Short "new booking" e-mail to the therapist. Pure. Holds no health information:
// no reason for the visit, no intake answers. The therapist reads those after signing in
// (master prompt 11.2: a secure link, not the content). Dutch first, then English.

import { escapeHtml, type RenderedEmail } from "./booking-confirmation";

export interface NewBookingData {
  therapistName: string;
  clientFirstName: string;
  serviceName: { nl: string; en: string };
  start: string;
  durationMin: number;
  calendarUrl: string;
}

const TZ = "Europe/Amsterdam";
const FONT = "font-family:Lato,'Helvetica Neue',Arial,sans-serif;";

function when(iso: string, tag: string, at: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(tag, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat(tag, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${day} ${at} ${time}`;
}

export function renderTherapistNewBooking(d: NewBookingData): RenderedEmail {
  const nl = {
    hello: `Hallo ${d.therapistName},`,
    line: `${d.clientFirstName} heeft online geboekt: ${d.serviceName.nl}, ${when(d.start, "nl-NL", "om")} (${d.durationMin} minuten). De aanbetaling is betaald.`,
    more: "De gegevens en het intakeformulier zie je in je agenda nadat je bent ingelogd.",
    button: "Open mijn agenda",
  };
  const en = {
    hello: `Hello ${d.therapistName},`,
    line: `${d.clientFirstName} booked online: ${d.serviceName.en}, ${when(d.start, "en-GB", "at")} (${d.durationMin} minutes). The deposit is paid.`,
    more: "You can see the details and the intake form in your calendar after you sign in.",
    button: "Open my calendar",
  };
  const subject = `Nieuwe afspraak / New booking: ${d.clientFirstName}, ${when(d.start, "nl-NL", "om")}`;
  const P = `margin:0 0 14px;font-size:18px;line-height:1.6;color:#352f2b;${FONT}`;
  const block = (w: typeof nl) =>
    `<p style="${P}">${escapeHtml(w.hello)}</p><p style="${P}">${escapeHtml(w.line)}</p><p style="${P}">${escapeHtml(w.more)}</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="border-radius:8px;background:#3b5241;">` +
    `<a href="${escapeHtml(d.calendarUrl)}" style="display:inline-block;padding:14px 28px;font-size:18px;color:#ffffff;text-decoration:none;font-weight:bold;${FONT}">${escapeHtml(w.button)}</a></td></tr></table>`;
  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f3ee;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;"><tr><td style="padding:28px;">
${block(nl)}<hr style="border:none;border-top:1px solid #d9d3cc;margin:24px 0;"><div lang="en">${block(en)}</div>
</td></tr></table></td></tr></table></body></html>`;
  const text = [nl.hello, nl.line, nl.more, `${nl.button}: ${d.calendarUrl}`, "", "---", "", en.hello, en.line, en.more, `${en.button}: ${d.calendarUrl}`].join("\n");
  return { subject, html, text };
}
