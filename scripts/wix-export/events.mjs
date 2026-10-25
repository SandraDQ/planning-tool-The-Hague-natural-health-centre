// Renders every event page from event-pages-sitemap.xml (4 at a time) and writes pages/events.json. No attendee data is read.
import { OUT, chromium, pool, save, sleep, gotoPolitely, HIDE_CHROME_CSS } from "./web.mjs";
import { readFileSync } from "node:fs";
import { loadSitemaps } from "./sitemap.mjs";

const isBad = (e) => e.error || /just a moment/i.test(e.title ?? "");

// Wix rich content (Ricos) -> simple Markdown text.
const text = (n) => n.textData?.text ?? (n.nodes ?? []).map(text).join("");
const ricos = (nodes = []) => nodes.map((n) => {
  if (n.type === "BULLETED_LIST" || n.type === "ORDERED_LIST")
    return n.nodes.map((li, i) => `${n.type === "ORDERED_LIST" ? `${i + 1}.` : "-"} ${text(li).trim()}`).join("\n");
  if (n.type === "HEADING") return `${"#".repeat(n.headingData?.level ?? 2)} ${text(n).trim()}`;
  if (n.type === "IMAGE" && n.imageData?.image?.src?.id) return `![](https://static.wixstatic.com/media/${n.imageData.image.src.id})`;
  return text(n).replace(/ /g, " ").trim();
}).filter(Boolean).join("\n\n");

async function scrape(ctx, { url, lastmod }) {
  const page = await ctx.newPage();
  try {
    await gotoPolitely(page, url);
    await page.addStyleTag({ content: HIDE_CHROME_CSS });
    await page.waitForSelector('[data-hook="tickets-picker"], [data-hook="ticket"]', { timeout: 4000 }).catch(() => {});
    const dom = await page.evaluate(() => {
      const flat = (e) => e.innerText.split("\n").map((x) => x.trim()).filter(Boolean).join(" | ");
      const t = (sel) => { const e = document.querySelector(sel); return e ? flat(e) : ""; };
      let ld = {};
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { const j = JSON.parse(s.textContent); if (j["@type"] === "Event") ld = j; } catch {}
      }
      return {
        warmup: document.getElementById("wix-warmup-data")?.textContent ?? "{}",
        date: t('[data-hook="event-full-date"]'),
        location: t('[data-hook="event-full-location"]'),
        tickets: [...document.querySelectorAll('[data-hook="ticket"]')].map((e) => flat(e).split(" | ").filter((x) => !/^(Ticket type|Price|Quantity|\d+)$/.test(x)).join(" | ")),
        registration: t('[data-hook="tickets-unavailable"]') || t('[data-hook="get-tickets-button"]') || t('[data-hook*="rsvp" i]'),
        price: t('[data-hook="price"]'),
        status: (ld.eventStatus ?? "").split("/").pop(),
        start: ld.startDate ?? "", end: ld.endDate ?? "",
      };
    });
    const state = Object.values(JSON.parse(dom.warmup).appsWarmupData ?? {}).find((a) => a.EventsPageInitialState)?.EventsPageInitialState;
    const e = state?.event?.event ?? {};
    return {
      url, lastmod,
      title: e.title ?? (await page.title()),
      date_text: dom.date || e.scheduling?.formatted || "",
      start: dom.start, end: dom.end,
      status: dom.status,
      location: dom.location || [e.location?.name, e.location?.address].filter(Boolean).join(", "),
      price_text: dom.tickets.join(" || ") || dom.price || "",
      registration_text: dom.registration,
      summary: e.description ?? "",
      description: ricos(e.longDescription?.nodes) || e.about || "",
      image: e.mainImage?.url ?? "",
    };
  } catch (err) {
    console.log("FAIL", url, err.message);
    return { url, lastmod, error: err.message };
  } finally {
    await page.close();
  }
}

// RETRY=1 re-does only the entries in the existing events.json that failed; LIMIT=n for a quick test.
const prev = process.env.RETRY ? JSON.parse(readFileSync(OUT + "pages/events.json", "utf8")) : null;
const events = prev ?? (await loadSitemaps()).filter((r) => r.type === "event-pages").slice(0, +process.env.LIMIT || undefined);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Skip images, media and fonts: we only need text, and it keeps the load on the site low.
await ctx.route("**/*", (r) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
let done = 0;
const out = prev ? prev.map((e) => (isBad(e) ? { ...e, error: e.error ?? "bot check" } : e)) : await pool(events, 4, async (ev) => {
  const r = await scrape(ctx, ev);
  if (++done % 20 === 0) console.log(done, "/", events.length);
  return r;
});
// Retry failures one at a time, slowly.
for (const [i, ev] of out.entries()) {
  if (!ev.error && !isBad(ev)) continue;
  await sleep(5000);
  out[i] = await scrape(ctx, { url: ev.url, lastmod: ev.lastmod });
  console.log("retry", ev.url, out[i].error ? "failed again" : "ok");
}
out.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
save("pages/events.json", JSON.stringify(out, null, 1) + "\n");
console.log(`events: ${out.length}, failed: ${out.filter(isBad).length}, no price text: ${out.filter((o) => !o.error && !o.price_text).length}`);
await browser.close();
