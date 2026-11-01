// Booking confirmation e-mail: subject, HTML and plain text, NL or EN. Pure (no server
// imports), so the portal can show a live preview while someone types.
//
// Written for every age: large text, high contrast, one column, the date and time first,
// plain words, and no images that are needed to understand it.

import type { Locale } from "@/lib/domain/types";

export interface ConfirmationData {
  locale: Locale;
  clientFirstName: string;
  therapistName: string;
  therapistEmail: string | null;
  serviceName: string;
  sessionTypeName: string;
  /** ISO UTC start. */
  start: string;
  durationMin: number;
  roomName: string | null;
  priceCents: number;
  depositPaidCents: number;
  /** Latest free-cancellation moment (ISO UTC), null when unknown. */
  freeCancelUntil: string | null;
  /** The therapist's own policy words, already in the right language. */
  policyText: string | null;
  /** The therapist's personal message, in the right language. */
  personalMessage: string;
  /** Centre practical information, in the right language. */
  centreInfo: string;
  reference: string;
  centre: { name: string; address: string; phone: string; email: string; website: string; mapUrl: string };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const TZ = "Europe/Amsterdam";

const words = {
  nl: {
    subject: (d: string, t: string) => `Je afspraak op ${d} om ${t} is bevestigd`,
    preheader: (name: string) => `Je afspraak bij ${name} staat vast.`,
    title: "Je afspraak is geboekt",
    hello: (n: string) => `Beste ${n},`,
    fromTherapist: (n: string) => `Een bericht van ${n}`,
    details: "Je afspraak",
    when: "Wanneer",
    duration: (m: number) => `${m} minuten`,
    with: "Bij",
    treatment: "Behandeling",
    where: "Waar",
    paid: "Aanbetaling betaald",
    due: "Nog te betalen bij de afspraak",
    cancelTitle: "Kun je niet komen?",
    cancelFree: (d: string) => `Zeg je afspraak af vóór ${d}, dan krijg je je aanbetaling terug.`,
    cancelHow: (n: string) => `Afzeggen of verzetten? Beantwoord deze e-mail of neem contact op met ${n}.`,
    practical: "Goed om te weten",
    questions: "Vragen?",
    replyHint: (n: string) => `Beantwoord deze e-mail, dan komt je bericht bij ${n}.`,
    reference: "Referentie",
    at: "om",
    route: "Bekijk de route",
    help: "Hulp nodig? Bel het centrum:",
  },
  en: {
    subject: (d: string, t: string) => `Your appointment on ${d} at ${t} is confirmed`,
    preheader: (name: string) => `Your appointment with ${name} is booked.`,
    title: "Your appointment is booked",
    hello: (n: string) => `Dear ${n},`,
    fromTherapist: (n: string) => `A message from ${n}`,
    details: "Your appointment",
    when: "When",
    duration: (m: number) => `${m} minutes`,
    with: "With",
    treatment: "Treatment",
    where: "Where",
    paid: "Deposit paid",
    due: "Still to pay at your appointment",
    cancelTitle: "Can't make it?",
    cancelFree: (d: string) => `Cancel before ${d} and you get your deposit back.`,
    cancelHow: (n: string) => `To cancel or change your appointment, reply to this e-mail or contact ${n}.`,
    practical: "Good to know",
    questions: "Questions?",
    replyHint: (n: string) => `Reply to this e-mail and your message goes to ${n}.`,
    reference: "Reference",
    at: "at",
    route: "Show me the way",
    help: "Need help? Call the centre:",
  },
} as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Escaped text with line breaks kept; blank lines start a new paragraph. */
function paragraphs(text: string, style: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="${style}">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function fmt(locale: Locale) {
  const tag = locale === "nl" ? "nl-NL" : "en-GB";
  return {
    day: (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)),
    shortDay: (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)),
    time: (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)),
    euro: (cents: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(cents / 100),
  };
}

const C = { fg: "#352f2b", muted: "#5f5650", accent: "#3b5241", soft: "#eef3ef", line: "#d9d3cc", bg: "#f6f3ee" };
const FONT = "font-family:Lato,'Helvetica Neue',Arial,sans-serif;";
const P = `margin:0 0 16px;font-size:18px;line-height:1.6;color:${C.fg};${FONT}`;
const H2 = `margin:0 0 12px;font-size:20px;line-height:1.4;color:${C.accent};font-weight:bold;${FONT}`;

export function renderBookingConfirmation(d: ConfirmationData): RenderedEmail {
  const w = words[d.locale];
  const f = fmt(d.locale);
  const day = f.day(d.start);
  const time = f.time(d.start);
  const balance = Math.max(0, d.priceCents - d.depositPaidCents);
  const free = d.freeCancelUntil && Date.parse(d.freeCancelUntil) > 0 ? `${f.shortDay(d.freeCancelUntil)} ${w.at} ${f.time(d.freeCancelUntil)}` : null;
  const where = [d.roomName, d.centre.address].filter(Boolean).join(", ");
  const subject = w.subject(f.shortDay(d.start), time);

  const rows: [string, string][] = [
    [w.when, `${day}\n${w.at} ${time} (${w.duration(d.durationMin)})`],
    [w.with, d.therapistName],
    [w.treatment, d.sessionTypeName && d.sessionTypeName !== d.serviceName ? `${d.serviceName}, ${d.sessionTypeName}` : d.serviceName],
    [w.where, where],
    ...(d.depositPaidCents > 0 ? ([[w.paid, f.euro(d.depositPaidCents)]] as [string, string][]) : []),
    [w.due, f.euro(balance)],
  ];

  const cancelLines = [free ? w.cancelFree(free) : null, d.policyText?.trim() || null, w.cancelHow(d.therapistName)].filter(Boolean) as string[];

  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-top:1px solid ${C.line};vertical-align:top;">` +
        `<div style="font-size:15px;line-height:1.4;color:${C.muted};${FONT}">${escapeHtml(label)}</div>` +
        `<div style="font-size:19px;line-height:1.5;color:${C.fg};font-weight:bold;${FONT}">${escapeHtml(value).replace(/\n/g, "<br>")}</div>` +
        `</td></tr>`,
    )
    .join("");

  const replyTo = d.therapistEmail
    ? `<a href="mailto:${escapeHtml(d.therapistEmail)}" style="color:${C.accent};">${escapeHtml(d.therapistEmail)}</a>`
    : escapeHtml(d.centre.email);

  const html = `<!DOCTYPE html>
<html lang="${d.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(w.preheader(d.therapistName))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;">
<p style="margin:0 0 20px;font-size:16px;line-height:1.4;color:${C.accent};letter-spacing:0.04em;text-transform:uppercase;${FONT}">${escapeHtml(d.centre.name)}</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.3;color:${C.fg};font-weight:normal;${FONT}">${escapeHtml(w.title)}</h1>
<p style="${P}">${escapeHtml(w.hello(d.clientFirstName))}</p>
</td></tr>
<tr><td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:10px;"><tr><td style="padding:18px 20px 8px;">
<h2 style="${H2}">${escapeHtml(w.details)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr><td style="border-radius:8px;background:${C.accent};">
<a href="${escapeHtml(d.centre.mapUrl)}" style="display:inline-block;padding:14px 28px;font-size:18px;line-height:1.3;color:#ffffff;text-decoration:none;font-weight:bold;${FONT}">${escapeHtml(w.route)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 28px 0;">
<h2 style="${H2}">${escapeHtml(w.fromTherapist(d.therapistName))}</h2>
${paragraphs(d.personalMessage, P)}
</td></tr>
<tr><td style="padding:8px 28px 0;">
<h2 style="${H2}">${escapeHtml(w.cancelTitle)}</h2>
${cancelLines.map((l) => paragraphs(l, P)).join("")}
</td></tr>
${d.centreInfo.trim() ? `<tr><td style="padding:8px 28px 0;"><h2 style="${H2}">${escapeHtml(w.practical)}</h2>${paragraphs(d.centreInfo, P)}</td></tr>` : ""}
<tr><td style="padding:8px 28px 28px;">
<h2 style="${H2}">${escapeHtml(w.questions)}</h2>
<p style="${P}">${escapeHtml(w.replyHint(d.therapistName))}<br>${replyTo}</p>
<p style="${P}">${escapeHtml(w.help)}<br><a href="tel:${escapeHtml(d.centre.phone.replace(/[^+\d]/g, ""))}" style="color:${C.accent};font-weight:bold;font-size:20px;">${escapeHtml(d.centre.phone)}</a></p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${C.muted};${FONT}">${escapeHtml(d.centre.name)}<br>${escapeHtml(d.centre.address)}<br>${escapeHtml(d.centre.phone)} · <a href="${escapeHtml(d.centre.website)}" style="color:${C.accent};">${escapeHtml(d.centre.website.replace(/^https?:\/\//, ""))}</a><br>${escapeHtml(w.reference)}: ${escapeHtml(d.reference)}</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const text = [
    w.title.toUpperCase(),
    "",
    w.hello(d.clientFirstName),
    "",
    `${w.details.toUpperCase()}`,
    ...rows.map(([l, v]) => `${l}: ${v.replace(/\n/g, " ")}`),
    `${w.route}: ${d.centre.mapUrl}`,
    "",
    w.fromTherapist(d.therapistName).toUpperCase(),
    d.personalMessage.trim(),
    "",
    w.cancelTitle.toUpperCase(),
    ...cancelLines,
    ...(d.centreInfo.trim() ? ["", w.practical.toUpperCase(), d.centreInfo.trim()] : []),
    "",
    w.questions.toUpperCase(),
    `${w.replyHint(d.therapistName)} ${d.therapistEmail ?? d.centre.email}`,
    `${w.help} ${d.centre.phone}`,
    "",
    d.centre.name,
    d.centre.address,
    `${d.centre.phone} · ${d.centre.website}`,
    `${w.reference}: ${d.reference}`,
  ].join("\n");

  return { subject, html, text };
}

/** Example data for previews and test e-mails. */
export function sampleConfirmation(locale: Locale, overrides: Partial<ConfirmationData> = {}): ConfirmationData {
  const start = new Date(Date.now() + 7 * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  return {
    locale,
    clientFirstName: locale === "nl" ? "Anna" : "Anna",
    therapistName: "Ira",
    therapistEmail: null,
    serviceName: locale === "nl" ? "Acupunctuur" : "Acupuncture",
    sessionTypeName: locale === "nl" ? "Eerste consult" : "First consultation",
    start: start.toISOString(),
    durationMin: 60,
    roomName: locale === "nl" ? "Kamer 2" : "Room 2",
    priceCents: 8500,
    depositPaidCents: 2500,
    freeCancelUntil: new Date(start.getTime() - 24 * 3_600_000).toISOString(),
    policyText: null,
    personalMessage: "",
    centreInfo: "",
    reference: "DEMO-1234",
    centre: {
      name: "The Hague Natural Health Centre",
      address: "Badhuisstraat 224, 2584 HN, The Hague",
      phone: "+31 6 23 32 87 57",
      email: "info@thehague-naturalhealthcentre.com",
      website: "https://www.thehague-naturalhealthcentre.com",
      mapUrl: "https://www.google.com/maps/place/Badhuisstraat+224,+2584+HN+Den+Haag,+Netherlands",
    },
    ...overrides,
  };
}
