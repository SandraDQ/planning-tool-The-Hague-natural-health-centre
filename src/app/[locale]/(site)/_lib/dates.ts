import type { Locale } from "@/i18n/routing";

const NL_DAYS: Record<string, string> = { Mon: "ma", Tue: "di", Wed: "wo", Thu: "do", Fri: "vr", Sat: "za", Sun: "zo" };
const NL_MONTHS: Record<string, string> = {
  Jan: "jan", Feb: "feb", Mar: "mrt", Apr: "apr", May: "mei", Jun: "jun",
  Jul: "jul", Aug: "aug", Sep: "sep", Oct: "okt", Nov: "nov", Dec: "dec",
};

/** "Thu 29 Oct" as on the site; in Dutch "do 29 okt". */
export function shortEventDate(text: string, locale: Locale) {
  if (locale === "en") return text;
  return text.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => NL_DAYS[d]).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => NL_MONTHS[m]);
}

/** Long date + time of an event in the reader's language, in the centre's time zone. */
export function eventDateRange(start: string, end: string, locale: Locale) {
  const tag = locale === "nl" ? "nl-NL" : "en-GB";
  const day = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const s = new Date(start);
  const e = new Date(end);
  return `${day.format(s)}, ${time.format(s)} – ${time.format(e)}`;
}

/** "26 February 2026" / "26 februari 2026" for blog posts. */
export function postDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
}
