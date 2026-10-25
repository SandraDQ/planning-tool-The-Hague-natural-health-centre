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

// D28: demo mode needs an explicit DEMO_MODE=1. Local `next dev` gets it by default so the
// MVP runs out of the box; `next build` / `next start` / Vercel never do (set it there on purpose).
// The server still refuses it next to real service keys (src/lib/server/mode-core.ts).
if (process.env.NODE_ENV === "development" && process.env.DEMO_MODE === undefined) {
  process.env.DEMO_MODE = "1";
}

// Security headers (handoffs/reviews/mvp-app-review.md, F5).
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Next's App Router injects inline bootstrap scripts; move to a nonce (middleware) later to drop 'unsafe-inline'.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com", // MapBand embed
  "frame-ancestors 'none'",
  "form-action 'self'", // Phase 5: add https://www.mollie.com
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // add "; preload" once the domain is final
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Personal pages: never leak the URL (booking ids) and never cache.
        source: "/:locale(nl|en)/:area(admin|therapist|account|book|login)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  async redirects() {
    return wixRedirects;
  },
};

export default withNextIntl(nextConfig);
