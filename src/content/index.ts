/**
 * Website content (D19: the current site's text, kept as it is).
 *
 * - pages/<page>.en.json: the live site's English text, copied verbatim from the Wix export.
 * - pages/<page>.nl.json: Dutch DRAFTS (the live site has no Dutch). Listed for owner
 *   approval in handoffs/phase2-site-rebuilder-nl-drafts.md.
 * - blog/: the 24 blog posts (English only, as on the site) + categories.
 * - events.json: the events list and the event details from the export.
 * - media.json: size of every image in public/media (written by the media copy step).
 *
 * Every page is generated at build time, so the file reads below never run on a request.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locale } from "@/i18n/routing";
import aboutEn from "./pages/about.en.json";
import aboutNl from "./pages/about.nl.json";
import blogEn from "./pages/blog.en.json";
import blogNl from "./pages/blog.nl.json";
import bookingEn from "./pages/booking.en.json";
import bookingNl from "./pages/booking.nl.json";
import conditionsEn from "./pages/conditions.en.json";
import conditionsNl from "./pages/conditions.nl.json";
import contactEn from "./pages/contact.en.json";
import contactNl from "./pages/contact.nl.json";
import eventsEn from "./pages/events.en.json";
import eventsNl from "./pages/events.nl.json";
import homeEn from "./pages/home.en.json";
import homeNl from "./pages/home.nl.json";
import pricingEn from "./pages/pricing.en.json";
import pricingNl from "./pages/pricing.nl.json";
import privacyEn from "./pages/privacy.en.json";
import privacyNl from "./pages/privacy.nl.json";
import therapiesEn from "./pages/therapies.en.json";
import therapiesNl from "./pages/therapies.nl.json";
import postsJson from "./blog/posts.json";
import categoriesJson from "./blog/categories.json";
import eventsJson from "./events.json";

/** Both languages must have exactly the same shape (checked by TypeScript). */
function pair<T>(en: T, nl: NoInfer<T>): Record<Locale, T> {
  return { en, nl };
}

const pages = {
  home: pair(homeEn, homeNl),
  therapies: pair(therapiesEn, therapiesNl),
  conditions: pair(conditionsEn, conditionsNl),
  about: pair(aboutEn, aboutNl),
  events: pair(eventsEn, eventsNl),
  blog: pair(blogEn, blogNl),
  contact: pair(contactEn, contactNl),
  privacy: pair(privacyEn, privacyNl),
  pricing: pair(pricingEn, pricingNl),
  booking: pair(bookingEn, bookingNl),
};

export type PageName = keyof typeof pages;

export function getPage<K extends PageName>(name: K, locale: Locale): (typeof pages)[K]["en"] {
  return pages[name][locale];
}

/* ------------------------------------------------------------------ media */

export { mediaSize, type ContentImage } from "./media";

/* ------------------------------------------------------------------ blog */

export type Post = (typeof postsJson)[number];
export type Category = (typeof categoriesJson)[number];

export function getPosts(): Post[] {
  return postsJson;
}

export function getPost(slug: string): Post | undefined {
  return postsJson.find((p) => p.slug === slug);
}

/** The post body (Markdown, English as on the site). Read at build time only. */
export function getPostBody(slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) return "";
  return fs.readFileSync(path.join(process.cwd(), "src/content/blog/posts", `${slug}.md`), "utf8");
}

export function getCategories(): Category[] {
  return categoriesJson;
}

export function getCategory(slug: string): Category | undefined {
  return categoriesJson.find((c) => c.slug === slug);
}

/* ------------------------------------------------------------------ events */

export type EventListing = (typeof eventsJson.listing)[number];
export type EventDetail = (typeof eventsJson.details)[number];

/** The events list as shown on the Events page (in the site's order). */
export function getEventListing(): EventListing[] {
  return eventsJson.listing;
}

/** Every event that has its own page: full details from the export, else the list entry. */
export function getEventPages(): { slug: string; listing?: EventListing; detail?: EventDetail }[] {
  const out = new Map<string, { slug: string; listing?: EventListing; detail?: EventDetail }>();
  for (const l of eventsJson.listing) out.set(l.slug, { slug: l.slug, listing: l });
  for (const d of eventsJson.details) out.set(d.slug, { ...out.get(d.slug), slug: d.slug, detail: d });
  return [...out.values()];
}

export function getEventPage(slug: string) {
  return getEventPages().find((e) => e.slug === slug);
}
