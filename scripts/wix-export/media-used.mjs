// Builds wix-export/media-used.json: every wixstatic media id seen on the live pages and events, with the pages using it.
import { readFileSync, existsSync } from "node:fs";
import { OUT, save } from "./web.mjs";

const read = (p, d) => (existsSync(OUT + p) ? JSON.parse(readFileSync(OUT + p, "utf8")) : d);
const manifest = new Map(read("media/manifest.json", []).map((m) => [m.id, m]));
const byPage = read("pages/_media-by-page.json", {});
const events = read("pages/events.json", []);

const used = new Map();
const add = (id, url, use) => {
  const u = used.get(id) ?? used.set(id, new Map()).get(id);
  u.set(url, new Set([...(u.get(url) ?? []), use]));
};
for (const [url, list] of Object.entries(byPage))
  for (const m of list) add(m.id, url, m.area === "meta" ? "og:image" : `${m.area} ${m.background ? "background" : m.kind}`);
const idOf = (u) => decodeURIComponent(u).match(/static\.wixstatic\.com\/media\/([^/?#"')\s]+)/)?.[1];
for (const e of events) {
  if (e.image) add(idOf(e.image), e.url, "event main image");
  for (const [, u] of (e.description ?? "").matchAll(/\]\((https:\/\/static\.wixstatic\.com\/media\/[^)]+)\)/g)) add(idOf(u), e.url, "event description image");
}

const out = [...used].map(([id, pages]) => {
  const m = manifest.get(id);
  const urls = [...pages.keys()];
  return {
    id,
    url: id.startsWith("video:") ? null : `https://static.wixstatic.com/media/${id}`,
    in_media_export: !!m,
    file: m?.file ?? null,
    name: m?.displayName ?? null,
    only_on_event_pages: urls.every((u) => u.includes("/event-details")),
    only_in_header_footer: [...pages.values()].every((s) => [...s].every((x) => /^(header|footer)/.test(x))),
    pages: urls.map((url) => ({ url, uses: [...pages.get(url)] })),
  };
}).sort((a, b) => b.pages.length - a.pages.length || a.id.localeCompare(b.id));
save("media-used.json", JSON.stringify(out, null, 1) + "\n");
const notIn = out.filter((o) => !o.in_media_export);
console.log(`media ids used: ${out.length}; on non-event pages: ${out.filter((o) => !o.only_on_event_pages).length}; not in media/manifest.json: ${notIn.length}`, notIn.map((o) => o.id).slice(0, 20));
