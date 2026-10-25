// Saves the web font files the site actually loads, a local fonts.css, and computed typography (desktop + mobile) to brand/fonts/.
import { BASE, chromium, devices, get, save, sleep, openPage } from "./web.mjs";

const PAGES = ["/", "/about-us", "/services-1", "/contact", "/events", "/blog", "/post/the-lost-art-of-ceremony", "/service-page/reiki-session"];
const SHAPES = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { ...devices["iPhone 13"], deviceScaleFactor: 2 } };

// Runs in the browser: distinct computed text styles per element role.
function typography() {
  const roles = {
    h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6",
    body: "#PAGES_CONTAINER p", nav: "#SITE_HEADER nav a, #SITE_HEADER nav li", footer: "#SITE_FOOTER p",
    button: ".wixui-button, a[data-testid='linkElement'][class*='button' i], button.wixui-button",
    link: "#PAGES_CONTAINER p a",
  };
  const hex = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/); return m ? "#" + m.slice(1, 4).map((v) => (+v).toString(16).padStart(2, "0")).join("") : c; };
  const out = {};
  for (const [role, sel] of Object.entries(roles)) {
    const seen = {};
    for (const el of document.querySelectorAll(sel)) {
      const t = el.innerText?.trim();
      if (!t || !el.getClientRects().length) continue;
      // Wix puts the real font on an inner span; use the deepest element holding the first text.
      let x = el;
      while (x.firstElementChild && x.firstElementChild.innerText?.trim() === x.innerText.trim()) x = x.firstElementChild;
      const s = getComputedStyle(x);
      const key = [s.fontFamily, s.fontWeight, s.fontStyle, s.fontSize, s.lineHeight, s.letterSpacing, s.textTransform, hex(s.color)].join(" | ");
      seen[key] ??= { family: s.fontFamily, weight: s.fontWeight, style: s.fontStyle, size: s.fontSize, line_height: s.lineHeight, letter_spacing: s.letterSpacing, transform: s.textTransform, color: hex(s.color), count: 0, example: t.slice(0, 50) };
      seen[key].count++;
    }
    out[role] = Object.values(seen).sort((a, b) => b.count - a.count);
  }
  return out;
}

const browser = await chromium.launch();
const cssTexts = new Map(); // url -> css text
const fontUrls = new Set();
const typo = {};
for (const [shape, opts] of Object.entries(SHAPES)) {
  const ctx = await browser.newContext(opts);
  ctx.on("response", async (r) => {
    const type = r.request().resourceType();
    if (type === "font") fontUrls.add(r.url());
    if (type === "stylesheet" && !cssTexts.has(r.url())) cssTexts.set(r.url(), await r.text().catch(() => ""));
  });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await openPage(page, BASE + path);
    const inline = await page.evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n"));
    cssTexts.set(`inline:${path}`, inline);
    typo[shape] ??= {};
    typo[shape][path] = await page.evaluate(typography);
    console.log("ok", shape, path);
    await sleep(1000);
  }
  await ctx.close();
}
await browser.close();

// Keep @font-face rules whose src points at a font file the browser really loaded.
const faces = new Map(); // block -> base URL for its relative urls
for (const [src, css] of cssTexts) {
  const base = src.startsWith("inline:") ? BASE : src;
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    if ([...block.matchAll(/url\(["']?([^"')]+)["']?\)/g)].some((m) => fontUrls.has(new URL(m[1], base).href))) faces.set(block, base);
  }
}
const local = new Map();
for (const u of fontUrls) {
  // Uploaded Wix fonts are all called file.woff2; prefix them with their font id.
  const parts = decodeURIComponent(new URL(u).pathname).split("/");
  const name = (parts.at(-1).startsWith("file.") ? `${parts.at(-3)}-${parts.at(-1)}` : parts.at(-1)).replace(/[^\w.-]+/g, "_");
  const res = await get(u);
  if (!res.ok) { console.log("font FAIL", res.status, u); continue; }
  save(`brand/fonts/${name}`, Buffer.from(await res.arrayBuffer()));
  local.set(u, name);
}
let fontsCss = `/* @font-face rules for the fonts the live site loads (desktop + mobile, ${PAGES.length} pages). Original URLs in comments. */\n\n`;
for (const [block, base] of faces) {
  // Point downloaded files at the local copy; leave other formats as absolute URLs.
  const b = block.replace(/url\(["']?([^"')]+)["']?\)/g, (m, raw) => {
    const abs = new URL(raw, base).href;
    return local.has(abs) ? `url("${local.get(abs)}") /* ${abs} */` : `url("${abs}")`;
  });
  fontsCss += b.replace(/\s+/g, " ").replace(/;\s*/g, ";\n  ").replace("{ ", "{\n  ") + "\n\n";
}
save("brand/fonts/fonts.css", fontsCss);
save("brand/fonts/typography.json", JSON.stringify(typo, null, 1) + "\n");

// Markdown summary: the most common style per role, desktop vs mobile, merged over all pages.
const merge = (shape) => {
  const roles = {};
  for (const page of Object.values(typo[shape])) for (const [role, list] of Object.entries(page)) for (const s of list) {
    const k = JSON.stringify({ ...s, count: 0, example: "" });
    roles[role] ??= {};
    roles[role][k] ??= { ...s, count: 0 };
    roles[role][k].count += s.count;
  }
  return Object.fromEntries(Object.entries(roles).map(([r, m]) => [r, Object.values(m).sort((a, b) => b.count - a.count).slice(0, 4)]));
};
const table = (shape) => {
  const rows = [];
  for (const [role, list] of Object.entries(merge(shape))) for (const s of list)
    rows.push(`| ${role} | ${s.family} | ${s.weight} | ${s.size} | ${s.line_height} | ${s.letter_spacing} | ${s.transform} | ${s.color} | ${s.count} | ${s.example.replace(/[|\n]/g, " ")} |`);
  return `| role | family | weight | size | line-height | letter-spacing | transform | colour | count | example |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`;
};
save("brand/fonts/typography.md", `# Typography (computed styles)

Pages sampled: ${PAGES.join(", ")}. Up to 4 most common styles per role. Full per-page data: \`typography.json\`.
Font files here: ${[...local.values()].map((f) => `\`${f}\``).join(", ")}. Declarations: \`fonts.css\`.

## Desktop (1440px)

${table("desktop")}

## Mobile (390px, iPhone 13)

${table("mobile")}
`);
console.log(`fonts: ${local.size} files, ${faces.size} @font-face rules`);
