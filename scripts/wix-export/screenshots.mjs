// Full-page desktop (1440) and mobile (390, iPhone-like) screenshots of main pages, services, 3 blog posts, 1 event and unlisted menu pages.
import { existsSync, readFileSync } from "node:fs";
import { chromium, devices, pool, save, slugOf, openPage, privacyMask, OUT } from "./web.mjs";
import { loadSitemaps } from "./sitemap.mjs";

const all = await loadSitemaps();
const of = (type) => all.filter((r) => r.type === type).map((r) => r.url);
const unlistedFile = OUT + "pages/_unlisted-urls.txt";
const unlisted = existsSync(unlistedFile) ? readFileSync(unlistedFile, "utf8").split("\n").filter(Boolean) : [];
const urls = [...of("pages"), ...of("booking-services"), ...of("blog-posts").slice(0, 3), ...of("event-pages").slice(0, 1), ...unlisted];

const browser = await chromium.launch();
const shapes = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], deviceScaleFactor: 2 },
};
const failed = [];
for (const [name, opts] of Object.entries(shapes)) {
  const ctx = await browser.newContext(opts);
  await pool(urls, 2, async (url) => {
    const page = await ctx.newPage();
    try {
      await openPage(page, url);
      const buf = await page.screenshot({ fullPage: true, timeout: 120000, ...privacyMask(page) });
      save(`screenshots/${slugOf(url)}-${name}.png`, buf);
      console.log("ok", name, slugOf(url));
    } catch (e) {
      failed.push(`${name} ${url}: ${e.message}`);
      console.log("FAIL", name, url, e.message);
    } finally {
      await page.close();
    }
  });
  await ctx.close();
}
console.log(`${urls.length} urls x 2 sizes, failed ${failed.length}`, failed);
await browser.close();
