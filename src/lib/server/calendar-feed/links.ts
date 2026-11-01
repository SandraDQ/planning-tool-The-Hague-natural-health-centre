import "server-only";
import { headers } from "next/headers";
import type { Locale } from "@/lib/domain/types";
import { sessionSecret } from "../session-token";
import { createFeedToken, type FeedSubject } from "./token";

/**
 * Key for signing feed links. CALENDAR_FEED_SECRET (32+ characters) when set, otherwise the
 * demo session secret. Changing it makes every existing link stop working.
 */
export function feedSecret(): string {
  const own = process.env.CALENDAR_FEED_SECRET;
  return own && own.length >= 32 ? own : sessionSecret();
}

export interface FeedLinks {
  /** https://…/api/calendar/<token>.ics?lang=nl */
  https: string;
  /** webcal://… (opens Apple Calendar and most desktop calendar apps) */
  webcal: string;
  google: string;
  outlook: string;
}

/** Subscribe links for the viewer's feed, built from the request's own host. */
export async function feedLinks(subject: FeedSubject, version: number, locale: Locale, calendarName: string): Promise<FeedLinks> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const path = `/api/calendar/${createFeedToken(subject, version, feedSecret())}.ics?lang=${locale}`;
  const https = `${proto}://${host}${path}`;
  const webcal = `webcal://${host}${path}`;
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(calendarName)}`,
  };
}
