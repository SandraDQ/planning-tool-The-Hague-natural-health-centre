import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import events from "./src/content/events.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/*
 * Redirects from the current Wix site's URLs (no language prefix) to the new site.
 * The live site's text is English, so old links and search results go to the
 * English version (/en/...). The home page "/" is left to next-intl, which picks
 * nl or en from the browser language (default nl). Paths stay the same as on Wix.
 * Full list and reasoning: handoffs/phase2-site-rebuilder.md.
 */
const WIX_PAGES = [
  "/kopie-van-therapies",
  "/kopie-van-conditions",
  "/about-us",
  "/events",
  "/blog",
  "/contact",
  "/privacy",
  "/services-1",
  "/booking",
];

// Events that have a page on the new site; any other old event URL goes to the events list.
const eventSlugs = [...new Set([...events.listing, ...events.details].map((e) => e.slug))];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wixRedirects = [
  ...WIX_PAGES.map((p) => ({ source: p, destination: `/en${p}` })),
  // The old unlisted Therapies page was replaced by /kopie-van-therapies (the menu's Therapies page).
  { source: "/therapies", destination: "/en/kopie-van-therapies" },
  { source: "/:locale(nl|en)/therapies", destination: "/:locale/kopie-van-therapies" },
  // The second home page (the old logo target); the owner confirmed "/" is the real home page.
  { source: "/copy-of-meditation-video", destination: "/" },
  { source: "/:locale(nl|en)/copy-of-meditation-video", destination: "/:locale" },
  { source: "/blog/page/:n", destination: "/en/blog" },
  { source: "/blog/categories/:category", destination: "/en/blog/categories/:category" },
  { source: "/post/:slug", destination: "/en/post/:slug" },
  { source: "/service-page/:slug", destination: "/en/service-page/:slug" },
  // Wix's booking calendar is replaced by the platform's online booking.
  { source: "/booking-calendar/:path*", destination: "/en/book" },
  { source: `/event-details-registration/:slug(${eventSlugs.map(escapeRe).join("|")})`, destination: "/en/event-details-registration/:slug" },
  { source: "/event-details-registration/:path*", destination: "/en/events" },
  { source: "/event-info/:path*", destination: "/en/events" },
].map((r) => ({ ...r, permanent: true }));

const nextConfig: NextConfig = {
  async redirects() {
    return wixRedirects;
  },
};

export default withNextIntl(nextConfig);
