import { buildIcs } from "@/lib/server/calendar-feed/ics";
import { feedSecret } from "@/lib/server/calendar-feed/links";
import { readFeedToken } from "@/lib/server/calendar-feed/token";
import { getStore } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

const notFound = () => new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });

/** One-way calendar feed (7A): GET /api/calendar/<signed token>.ics?lang=nl|en */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.endsWith(".ics") ? file.slice(0, -4) : file;
  const locale = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "nl";
  try {
    const store = getStore();
    const parsed = readFeedToken(token, feedSecret());
    if (!parsed || parsed.version !== (await store.feeds.versionFor(parsed.subject))) return notFound();
    const now = Date.now();
    const range = { start: new Date(now - 30 * DAY).toISOString(), end: new Date(now + 180 * DAY).toISOString() };
    const events = await store.feeds.events(parsed.subject, range, locale);
    const name = parsed.subject.kind === "admin" ? (locale === "en" ? "THNHC rooms" : "THNHC kamers") : "THNHC";
    return new Response(buildIcs(events, { calendarName: name, nowIso: new Date(now).toISOString() }), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="thnhc.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    logSafeError("[calendar-feed]", err);
    return notFound();
  }
}
