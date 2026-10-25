// Saves the public sitemap index + child sitemaps as-is and writes sitemap/urls.csv (url,path,type,lastmod,title).
import { BASE, get, pool, save, parseSitemap, pathOf } from "./web.mjs";

const csv = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// Read only up to </title> of a page, then stop the download.
async function titleOf(url) {
  const res = await get(url);
  const reader = res.body.getReader();
  let html = "";
  while (!html.includes("</title>")) {
    const { done, value } = await reader.read();
    if (done) break;
    html += new TextDecoder().decode(value);
  }
  reader.cancel().catch(() => {});
  const t = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
  return t.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export async function loadSitemaps({ write = false } = {}) {
  const index = await (await get(`${BASE}/sitemap.xml`)).text();
  if (write) save("sitemap/sitemap.xml", index);
  const rows = [];
  for (const [, loc] of index.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const xml = await (await get(loc)).text();
    const name = loc.split("/").pop();
    if (write) save(`sitemap/${name}`, xml);
    const type = name.replace(/-sitemap\.xml$/, "");
    for (const u of parseSitemap(xml)) rows.push({ ...u, type, path: pathOf(u.url) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await loadSitemaps({ write: true });
  await pool(rows, 4, async (r) => { r.title = await titleOf(r.url).catch((e) => `ERROR ${e.message}`); });
  const lines = ["url,path,type,lastmod,title", ...rows.map((r) => [r.url, r.path, r.type, r.lastmod, r.title].map(csv).join(","))];
  save("sitemap/urls.csv", lines.join("\n") + "\n");
  const counts = rows.reduce((a, r) => ((a[r.type] = (a[r.type] ?? 0) + 1), a), {});
  console.log(rows.length, counts);
}
