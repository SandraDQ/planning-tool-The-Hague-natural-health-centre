// Renders every page/service/blog URL from the sitemaps (plus internal links missing from them) to pages/<type>/<slug>.md.
import { BASE, chromium, pool, save, slugOf, openPage, pageMeta, domToMarkdown, yamlStr } from "./web.mjs";
import { loadSitemaps } from "./sitemap.mjs";

const TYPES = ["pages", "booking-services", "blog-posts", "blog-categories"];
// Never render account/member areas or anything that starts a booking/checkout flow.
const PRIVATE = /\/(account|members?|profile|my-|booking-calendar|booking-form|checkout|cart|thank-you|_api|event-details|event-info)/i;

const frontMatter = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${yamlStr(v)}`).join("\n")}\n---\n\n`;
const norm = (href) => { const u = new URL(href); u.hash = ""; u.search = ""; return u.href.replace(/\/$/, ""); };

async function render(ctx, { url, type, lastmod }) {
  const page = await ctx.newPage();
  try {
    await openPage(page, url);
    const meta = await pageMeta(page);
    const md = await page.evaluate(domToMarkdown, "#PAGES_CONTAINER");
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
    const fm = { url, type, title: meta.title, description: meta.description, og_image: meta.ogImage, language: meta.language, lastmod };
    if (meta.published) Object.assign(fm, { published: meta.published, author: meta.author });
    if (meta.robots) fm.robots = meta.robots;
    if (meta.canonical && norm(meta.canonical) !== norm(url)) fm.canonical = meta.canonical;
    save(`pages/${type}/${slugOf(url)}.md`, frontMatter(fm) + md + "\n");
    console.log("ok", type, slugOf(url), md.length);
    return { ok: true, links };
  } catch (e) {
    console.log("FAIL", url, e.message);
    return { ok: false, url, error: e.message, links: [] };
  } finally {
    await page.close();
  }
}

async function siteChrome(ctx) {
  const page = await ctx.newPage();
  await openPage(page, BASE + "/");
  const header = await page.evaluate(domToMarkdown, "#SITE_HEADER");
  const footer = await page.evaluate(domToMarkdown, "#SITE_FOOTER");
  const extra = await page.evaluate(() => {
    const item = (li) => {
      const a = li.querySelector("a");
      const sub = li.querySelector("ul");
      return {
        label: (a?.textContent || li.firstElementChild?.textContent || "").trim(),
        href: a?.href ?? "",
        children: sub ? [...sub.children].filter((c) => c.tagName === "LI").map(item) : [],
      };
    };
    const nav = document.querySelector("#SITE_HEADER nav ul");
    const menu = nav ? [...nav.children].filter((c) => c.tagName === "LI").map(item) : [];
    const footerLinks = [...document.querySelectorAll("#SITE_FOOTER a[href]")].map((a) => ({
      text: (a.innerText || a.getAttribute("aria-label") || a.querySelector("img")?.alt || "").trim(), href: a.href,
    }));
    return { menu, footerLinks };
  });
  await page.close();
  const tree = (items, d = 0) => items.map((i) => `${"  ".repeat(d)}- [${i.label}](${i.href})\n${tree(i.children, d + 1)}`).join("");
  save("pages/_site-chrome.md", `# Site chrome (from ${BASE}/, desktop 1440px)

## Main menu

${tree(extra.menu)}
## Header (as rendered)

${header}

## Footer (as rendered: opening hours, address, phone, social)

${footer}

## Footer links

${extra.footerLinks.map((l) => `- [${l.text || "(icon)"}](${l.href})`).join("\n")}
`);
  return extra.menu.flatMap(function flat(i) { return [i.href, ...i.children.flatMap(flat)]; }).concat(extra.footerLinks.map((l) => l.href));
}

const all = await loadSitemaps();
const known = new Set(all.map((r) => norm(r.url)));
const targets = all.filter((r) => TYPES.includes(r.type));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const chromeLinks = await siteChrome(ctx);
const results = await pool(targets, 3, (t) => render(ctx, t));

// Internal links that are not in any sitemap (e.g. hidden menu pages) -> pages/unlisted/.
const found = new Set();
for (const href of [...chromeLinks, ...results.flatMap((r) => r.links)]) {
  if (!href.startsWith(BASE)) continue;
  const u = norm(href);
  if (!known.has(u) && !PRIVATE.test(new URL(u).pathname) && !/\/(post|blog)\//.test(u) && u !== BASE) found.add(u);
}
const unlisted = [...found].sort().map((url) => ({ url, type: "unlisted", lastmod: "" }));
console.log("unlisted:", unlisted.map((u) => u.url));
const r2 = await pool(unlisted, 3, (t) => render(ctx, t));
const fails = [...results, ...r2].filter((r) => !r.ok);
save("pages/_unlisted-urls.txt", unlisted.map((u) => u.url).join("\n") + "\n");
console.log(`rendered ${results.length + r2.length - fails.length}, failed ${fails.length}`, fails);
await browser.close();
