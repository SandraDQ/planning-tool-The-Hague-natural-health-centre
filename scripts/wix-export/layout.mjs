// Describes each main page section by section (layout/<slug>/layout.md + section screenshots), navigation, and brand/tokens.json.
import { existsSync, readFileSync } from "node:fs";
import { BASE, OUT, chromium, devices, save, sleep, slugOf, openPage, privacyMask } from "./web.mjs";

const PAGES = ["/", "/copy-of-meditation-video", "/about-us", "/services-1", "/contact", "/events", "/blog", "/booking",
  "/kopie-van-therapies", "/kopie-van-conditions",
  "/service-page/homeopathy-initial-consultation", "/service-page/homeopathy-follow-up-consultation", "/service-page/reiki-session"];
const manifestPath = OUT + "media/manifest.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const byId = new Map(manifest.map((m) => [m.id, m]));
const local = (id) => byId.get(id)?.file ?? "(not in media/manifest.json)";

// Runs in the browser: sections of a root element, each with background, rows of content and links.
function analyze(rootSel) {
  const hex = (c) => {
    const m = c && c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
    if (!m || m[4] === "0") return null;
    return "#" + m.slice(1, 4).map((v) => (+v).toString(16).padStart(2, "0")).join("") + (m[4] ? ` (alpha ${m[4]})` : "");
  };
  const idOf = (u) => decodeURIComponent(u || "").match(/static\.wixstatic\.com\/media\/([^/?#"')\s]+)/)?.[1] ?? null;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
  const root = document.querySelector(rootSel);
  const W = document.documentElement.clientWidth;
  let sections = [...root.querySelectorAll("section")].filter((s) => !s.parentElement.closest("section") && vis(s));
  if (!sections.length) sections = [root];
  const btnSel = ".wixui-button, a.wixui-button, [data-testid='buttonElement'], button[class*='button' i]";
  let btnIndex = 0;
  return sections.map((sec, n) => {
    const sr = sec.getBoundingClientRect();
    const top = sr.top + scrollY;
    const bgLayer = sec.querySelector(':scope > [id^="bgLayers"]');
    const under = bgLayer?.querySelector('[data-testid="colorUnderlay"]');
    // Background images of the section itself and of boxes/strips inside it.
    const bgImages = [...new Set([...sec.querySelectorAll('[id^="bgLayers"] img')].map((i) => idOf(i.currentSrc || i.src)).filter(Boolean))];
    const bgVideo = bgLayer?.querySelector("video")?.currentSrc ?? "";
    const items = [];
    const push = (el, kind, extra) => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      items.push({ kind, x: r.left, y: r.top + scrollY - top, w: r.width, h: r.height, ...extra });
    };
    for (const img of sec.querySelectorAll("img")) {
      if (img.closest('[id^="bgLayers"]') || img.closest(btnSel)) continue;
      const r = img.getBoundingClientRect();
      if (r.width * r.height < 3000) continue;
      push(img, "image", { id: idOf(img.currentSrc || img.src), alt: img.alt, link: img.closest("a")?.href ?? "" });
    }
    for (const t of sec.querySelectorAll('[data-testid="richTextElement"]')) {
      const heads = [...t.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => `${h.tagName.toLowerCase()}: ${h.innerText.trim().replace(/\s+/g, " ")}`).filter((h) => !h.endsWith(": "));
      const text = t.innerText.trim().replace(/\s+/g, " ");
      if (!text) continue;
      // Wix puts colour and font on inner spans: read the innermost element of the first block.
      let x = t.querySelector("h1,h2,h3,h4,h5,h6,p,li") ?? t;
      while (x.firstElementChild && x.firstElementChild.innerText?.trim() === x.innerText.trim()) x = x.firstElementChild;
      const s = getComputedStyle(x);
      push(t, heads.length ? "heading/text" : "text", { heads, text: text.slice(0, 140), color: hex(s.color), align: getComputedStyle(t.querySelector("h1,h2,h3,h4,h5,h6,p,li") ?? t).textAlign, font: `${s.fontSize} ${s.fontFamily.split(",")[0]}${s.letterSpacing !== "normal" ? ` ls ${s.letterSpacing}` : ""}` });
    }
    for (const b of sec.querySelectorAll(btnSel)) {
      if (b.parentElement.closest(btnSel)) continue;
      const a = b.closest("a") ?? b.querySelector("a");
      const s = getComputedStyle(b);
      const label = b.innerText.trim();
      let lab = b; // innermost element holding the label carries the text styles
      while (lab.firstElementChild && lab.firstElementChild.innerText?.trim() === label) lab = lab.firstElementChild;
      const ls = getComputedStyle(lab);
      if (!label) continue;
      b.setAttribute("data-export-btn", String(btnIndex));
      push(b, "button", { label, href: a?.href ?? "", btn: btnIndex++,
        style: { bg: hex(s.backgroundColor), color: hex(ls.color), radius: s.borderRadius, border: `${s.borderTopWidth} ${s.borderTopStyle} ${hex(s.borderTopColor) ?? "none"}`, width: Math.round(b.getBoundingClientRect().width), height: Math.round(b.getBoundingClientRect().height), font: ls.font, letter_spacing: ls.letterSpacing, transform: ls.textTransform, shadow: s.boxShadow } });
    }
    for (const f of sec.querySelectorAll("iframe")) push(f, "embed", { src: (() => { try { const u = new URL(f.src); return u.origin + u.pathname; } catch { return ""; } })(), title: f.title });
    for (const c of sec.querySelectorAll('[data-testid="custom-element"]')) push(c, "custom-element", { tag: c.firstElementChild?.tagName.toLowerCase() ?? "" });
    for (const w of sec.querySelectorAll('[data-testid="tpa-components-provider"], [id^="TPAMultiSection"], [id^="TPAWidget"], [id^="TPASection"]')) {
      if (w.parentElement.closest('[data-testid="tpa-components-provider"], [id^="TPA"]')) continue;
      const hook = w.querySelector("[data-hook]")?.getAttribute("data-hook") ?? "";
      push(w, "wix-app-widget", { hook });
    }
    // Group items into horizontal rows by vertical overlap, then left-to-right.
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const it of items) {
      const row = rows.find((r) => it.y < r.bottom - 8 && it.y + it.h > r.top + 8 && it.kind !== "wix-app-widget");
      if (row) { row.items.push(it); row.bottom = Math.max(row.bottom, it.y + it.h); } else rows.push({ top: it.y, bottom: it.y + it.h, items: [it] });
    }
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    // Content extents ignore app widgets and off-screen slides (carousels).
    const xs = items.filter((i) => i.kind !== "wix-app-widget" && i.x >= 0 && i.x + i.w <= W + 1);
    const left = Math.min(...xs.map((i) => i.x)), right = Math.max(...xs.map((i) => i.x + i.w));
    const firstY = Math.min(...items.map((i) => i.y)), lastY = Math.max(...items.map((i) => i.y + i.h));
    const gaps = rows.flatMap((r) => r.items.slice(1).map((it, i) => Math.round(it.x - (r.items[i].x + r.items[i].w)))).filter((g) => g > 0);
    const cols = [...sec.querySelectorAll('[data-testid="columns"]')].filter((c) => c.querySelector('[data-testid="column"]')).map((c) => ({ count: c.querySelectorAll(':scope > [data-testid="column"], :scope > * > [data-testid="column"]').length, gap: getComputedStyle(c).columnGap }));
    return {
      n: n + 1, id: sec.id, top: Math.round(top), height: Math.round(sr.height), width: Math.round(sr.width),
      bg: hex(under ? getComputedStyle(under).backgroundColor : getComputedStyle(sec).backgroundColor) ?? "transparent (page/white)",
      bgImages, bgVideo, cols, rows: rows.map((r) => r.items), pageWidth: W,
      content: xs.length ? { left: Math.round(left), right: Math.round(right), width: Math.round(right - left) } : null,
      padding: items.length ? { top: Math.round(firstY), bottom: Math.round(sr.height - lastY) } : null, gaps,
    };
  });
}

const pct = (v, W) => `${Math.round((v / W) * 100)}%`;
function sectionMd(s, label) {
  const lines = [`## ${label}`, "",
    `- Background: ${s.bg}${s.bgImages.length ? `; image ${s.bgImages.map((id) => `\`${id}\` -> \`${local(id)}\``).join(", ")}` : ""}${s.bgVideo ? `; video ${s.bgVideo}` : ""}`,
    `- Size: ${s.width}x${s.height}px at y=${s.top}${s.content ? `; content spans x ${s.content.left}-${s.content.right}px (${s.content.width}px wide)` : ""}${s.padding ? `; space above/below content ${s.padding.top}/${s.padding.bottom}px` : ""}`];
  if (s.cols.some((c) => c.count)) lines.push(`- Wix columns: ${s.cols.map((c) => `${c.count} cols (gap ${c.gap})`).join(", ")}`);
  s.rows.forEach((row, i) => {
    const desc = row.length === 1 ? "single block" : `${row.length} blocks side by side`;
    lines.push(`- Row ${i + 1} (${desc}):`);
    for (const it of row) {
      const where = `${pct(it.x, s.pageWidth)}-${pct(it.x + it.w, s.pageWidth)} of width`;
      if (it.kind === "image") lines.push(`  - Image [${where}, ${Math.round(it.w)}x${Math.round(it.h)}]: "${it.alt}" \`${it.id}\` -> \`${local(it.id)}\`${it.link ? ` (links to ${it.link})` : ""}`);
      else if (it.kind === "button") lines.push(`  - Button [${where}]: "${it.label}" -> ${it.href || "(no link)"}`);
      else if (it.kind === "embed") lines.push(`  - Embed [${where}]: ${it.title} ${it.src}`);
      else if (it.kind === "custom-element") lines.push(`  - Custom element [${where}, ${Math.round(it.w)}x${Math.round(it.h)}]: \`<${it.tag}>\`${/review/i.test(it.tag) ? " (third-party Google Reviews widget; reviewer names/photos not exported, masked in screenshots)" : ""}`);
      else if (it.kind === "wix-app-widget") lines.push(`  - Wix app widget [${where}, ${Math.round(it.h)}px tall]${it.hook ? ` (first data-hook: ${it.hook})` : ""}`);
      else lines.push(`  - ${it.heads.length ? `Text with headings (${it.heads.join(" / ")})` : "Text"} [${where}, ${it.font}, colour ${it.color}, align ${it.align}]: ${it.text}`);
    }
  });
  return lines.join("\n");
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const all = { pages: {}, buttons: [] };
for (const path of PAGES) {
  const slug = slugOf(BASE + path);
  const page = await ctx.newPage();
  try {
    await openPage(page, BASE + path);
    const sections = await page.evaluate(analyze, "#PAGES_CONTAINER");
    // Hover each button to read its hover colours (hover only, nothing is clicked).
    for (const s of sections) for (const it of s.rows.flat().filter((i) => i.kind === "button")) {
      const h = await page.$(`[data-export-btn="${it.btn}"]`);
      if (!h) continue;
      await h.hover({ timeout: 3000 }).catch(() => {});
      await sleep(400);
      it.style.hover = await h.evaluate((b) => {
        let lab = b;
        while (lab.firstElementChild && lab.firstElementChild.innerText?.trim() === b.innerText.trim()) lab = lab.firstElementChild;
        const s = getComputedStyle(b);
        return { bg: s.backgroundColor, color: getComputedStyle(lab).color, border: s.borderTopColor };
      }).catch(() => null);
      await page.mouse.move(0, 0);
      all.buttons.push({ page: path, label: it.label, ...it.style });
    }
    await page.addStyleTag({ content: "#SITE_HEADER{visibility:hidden!important}" });
    const handles = await page.$$("#PAGES_CONTAINER section");
    const shotIds = new Set(sections.map((s) => s.id));
    let k = 0;
    for (const h of handles) {
      const id = await h.getAttribute("id");
      if (!shotIds.has(id)) continue;
      k++;
      await h.screenshot({ path: `${OUT}layout/${slug}/section-${String(k).padStart(2, "0")}.png`, timeout: 60000, ...privacyMask(page) }).catch((e) => console.log("shot fail", slug, k, e.message));
    }
    all.pages[path] = sections;
    const md = sections.map((s) => sectionMd(s, `Section ${s.n}${s.rows.flat().find((i) => i.heads?.length) ? `: ${s.rows.flat().find((i) => i.heads?.length).heads[0].replace(/^h\d: /, "")}` : ""} (screenshot \`section-${String(s.n).padStart(2, "0")}.png\`)`));
    save(`layout/${slug}/layout.md`, `# Layout: ${BASE}${path}\n\nDesktop 1440px. Sections top to bottom, from the rendered DOM. Percentages are of the 1440px viewport.\nImages: media id -> local original from \`wix-export/media/manifest.json\`.\n\n${md.join("\n\n")}\n`);
    console.log("ok", path, sections.length, "sections");
  } catch (e) {
    console.log("FAIL", path, e.message);
  } finally {
    await page.close();
  }
  await sleep(1500);
}

// Navigation: header/footer structure, sticky behaviour, hover, mobile menu.
const nav = {};
{
  const page = await ctx.newPage();
  await openPage(page, BASE + "/");
  const headerInfo = () => {
    const H = document.querySelector("#SITE_HEADER"), s = getComputedStyle(H), r = H.getBoundingClientRect();
    // The visible header colour sits on an inner full-width layer, not on #SITE_HEADER itself.
    const under = [...H.querySelectorAll("*")].find((e) => e.getBoundingClientRect().width > innerWidth * 0.8 && !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor));
    return { position: s.position, top: Math.round(r.top), height: Math.round(r.height), bg: s.backgroundColor, underlay: under ? getComputedStyle(under).backgroundColor : "", z: s.zIndex, scrollY };
  };
  nav.headerAtTop = await page.evaluate(headerInfo);
  await page.screenshot({ path: `${OUT}layout/navigation/header-desktop-top.png`, clip: { x: 0, y: 0, width: 1440, height: 200 } });
  await page.evaluate(() => window.scrollTo(0, 1500));
  await sleep(1200);
  nav.headerScrolled = await page.evaluate(headerInfo);
  await page.screenshot({ path: `${OUT}layout/navigation/header-desktop-scrolled.png`, clip: { x: 0, y: 0, width: 1440, height: 200 } });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  // Colours/fonts come from the innermost element holding the label text (Wix styles an inner span/div).
  nav.menu = await page.evaluate(() => [...document.querySelectorAll("#SITE_HEADER nav li")].filter((li) => li.innerText.trim()).map((li) => {
    const deepest = (el) => { let x = el; while (x?.firstElementChild && x.firstElementChild.innerText?.trim() === x.innerText.trim()) x = x.firstElementChild; return x; };
    const a = li.querySelector("a"), s = getComputedStyle(deepest(a ?? li));
    return { label: li.innerText.trim(), href: a?.href ?? "", current: li.getAttribute("aria-current") ?? a?.getAttribute("aria-current") ?? "", color: s.color, font: s.font, letterSpacing: s.letterSpacing, transform: s.textTransform, submenu: !!li.querySelector("ul") };
  }));
  const item = await page.$("#SITE_HEADER nav li:nth-child(2) a");
  if (item) {
    const read = (a) => { let x = a; while (x.firstElementChild && x.firstElementChild.innerText?.trim() === x.innerText.trim()) x = x.firstElementChild; const s = getComputedStyle(x); return `${s.color} ${s.textDecorationLine}`; };
    const before = await item.evaluate(read);
    await item.hover();
    await sleep(400);
    nav.menuHover = { before, after: await item.evaluate(read), item: await item.innerText() };
    await page.mouse.move(0, 0);
  }
  nav.header = await page.evaluate(analyze, "#SITE_HEADER");
  nav.footer = await page.evaluate(analyze, "#SITE_FOOTER");
  const footer = await page.$("#SITE_FOOTER");
  await footer.screenshot({ path: `${OUT}layout/navigation/footer-desktop.png`, ...privacyMask(page) });
  nav.animations = await page.evaluate(() => {
    const names = {};
    for (const el of document.querySelectorAll("#SITE_CONTAINER *")) {
      const a = getComputedStyle(el).animationName;
      if (a && a !== "none") names[a] = (names[a] ?? 0) + 1;
    }
    const parts = {};
    for (const el of document.querySelectorAll("[data-motion-part]")) if (!/^BG_/.test(el.getAttribute("data-motion-part"))) parts[el.getAttribute("data-motion-part")] = (parts[el.getAttribute("data-motion-part")] ?? 0) + 1;
    const fixed = [...document.querySelectorAll("body *")].filter((e) => ["fixed", "sticky"].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 20 && e.id !== "SITE_HEADER" && !e.closest("#SITE_HEADER"))
      .filter((e, i, a) => !a.some((p) => p !== e && p.contains(e)))
      .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, text: (e.innerText.trim() || e.querySelector("iframe")?.title || "").slice(0, 40), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    return { cssAnimations: names, motionParts: parts, motionEnter: document.querySelectorAll("[data-motion-enter]").length, fixed };
  });
  await page.close();
}
{
  const mctx = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  const page = await mctx.newPage();
  await openPage(page, BASE + "/");
  nav.mobileHeader = await page.evaluate(() => {
    const H = document.querySelector("#SITE_HEADER"), s = getComputedStyle(H);
    return { position: s.position, height: Math.round(H.getBoundingClientRect().height) };
  });
  await page.screenshot({ path: `${OUT}layout/navigation/header-mobile.png` });
  // Opening the menu is a UI toggle only; nothing is submitted.
  const toggle = await page.$('#SITE_HEADER [data-testid="hamburger-menu-button"], #SITE_HEADER [aria-haspopup="dialog"], #SITE_HEADER button[aria-label*="menu" i], #SITE_HEADER [id*="MENU_AS_CONTAINER_TOGGLE"], #SITE_HEADER [class*="hamburger" i]');
  if (toggle) {
    nav.mobileToggle = await toggle.evaluate((b) => ({ tag: b.tagName, label: b.getAttribute("aria-label"), testid: b.dataset.testid ?? "" }));
    await toggle.click();
    await sleep(1500);
    await page.screenshot({ path: `${OUT}layout/navigation/menu-mobile-open.png` });
    nav.mobileMenuLayers = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed")
      .map((e) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), bg: st.backgroundColor, transition: st.transition }; })
      .filter((l) => l.w > 100 && l.h > 300 && !/rgba\(0, 0, 0, 0\)/.test(l.bg)));
    nav.mobileMenu = await page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => {
      const r = a.getBoundingClientRect(); return r.width && r.height && r.top >= 0 && r.top < innerHeight && a.innerText.trim();
    }).map((a) => ({ label: a.innerText.trim(), href: a.href })));
  } else nav.mobileToggle = null;
  await mctx.close();
}
await browser.close();

const rowsMd = (secs) => secs.map((s, i) => sectionMd(s, `Part ${i + 1}`)).join("\n\n");
save("layout/navigation.json", JSON.stringify(nav, null, 1) + "\n");
save("layout/navigation.md", `# Navigation, header and footer

Generated by \`scripts/wix-export/layout.mjs\` from ${BASE}/. Raw data: \`navigation.json\`. Screenshots in \`navigation/\`.

## Header (desktop 1440px)

- CSS position: \`${nav.headerAtTop.position}\` (z-index ${nav.headerAtTop.z}), height ${nav.headerAtTop.height}px.
- At top: top=${nav.headerAtTop.top}px, background ${nav.headerAtTop.bg} / underlay ${nav.headerAtTop.underlay || "none"}.
- After scrolling 1500px: top=${nav.headerScrolled.top}px, background ${nav.headerScrolled.bg} / underlay ${nav.headerScrolled.underlay || "none"} ${nav.headerScrolled.top === 0 ? "(stays pinned at the top: sticky header)" : "(scrolls away)"}.
- Menu hover: "${nav.menuHover?.item}" colour ${nav.menuHover?.before} -> ${nav.menuHover?.after}.
- Screenshots: \`navigation/header-desktop-top.png\`, \`navigation/header-desktop-scrolled.png\`.

### Menu items

| label | link | current page marker | colour | font | dropdown |
|---|---|---|---|---|---|
${nav.menu.map((m) => `| ${m.label} | ${m.href} | ${m.current} | ${m.color} | ${m.font} | ${m.submenu ? "yes" : "no"} |`).join("\n")}

### Header layout

${rowsMd(nav.header)}

## Header (mobile 390px)

- CSS position: \`${nav.mobileHeader.position}\`, height ${nav.mobileHeader.height}px. Screenshot \`navigation/header-mobile.png\`.
- Menu toggle: ${nav.mobileToggle ? `${nav.mobileToggle.tag} "${nav.mobileToggle.label ?? ""}" ${nav.mobileToggle.testid}; opened menu in \`navigation/menu-mobile-open.png\`` : "not found"}.
${nav.mobileMenuLayers?.length ? `- Full-height layers while open: ${nav.mobileMenuLayers.map((l) => `${l.w}x${l.h} at x=${l.x}, background ${l.bg}${l.transition && l.transition !== "all 0s ease 0s" ? `, transition ${l.transition}` : ""}`).join("; ")}` : ""}
${nav.mobileMenu ? `- Links visible with the menu open:\n${nav.mobileMenu.map((m) => `  - [${m.label.replace(/\n/g, " ")}](${m.href})`).join("\n")}` : ""}

## Footer (desktop)

Screenshot \`navigation/footer-desktop.png\`.

${rowsMd(nav.footer)}

## Animations seen

- CSS animation names in use after load: ${Object.entries(nav.animations.cssAnimations).map(([k, v]) => `\`${k}\` x${v}`).join(", ") || "none"}.
- Fixed (floating) elements on screen: ${nav.animations.fixed.map((f) => `"${f.text.replace(/\n/g, " ")}" (#${f.id}, ${f.w}x${f.h} at ${f.x},${f.y})`).join("; ") || "none"}.
- Wix motion parts (\`data-motion-part\`): ${Object.entries(nav.animations.motionParts).map(([k, v]) => `\`${k}\` x${v}`).join(", ") || "none"}; \`data-motion-enter\` elements: ${nav.animations.motionEnter}.
`);

// Design tokens aggregated over the main pages.
const count = (arr) => Object.entries(arr.reduce((m, k) => (k && (m[k] = (m[k] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const secs = Object.entries(all.pages).flatMap(([p, ss]) => ss.map((s) => ({ ...s, page: p })));
const items = secs.flatMap((s) => s.rows.flat().map((i) => ({ ...i, page: s.page })));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const btnKey = (b) => JSON.stringify([b.bg, b.color, b.radius, b.border, b.height, b.font, b.hover?.bg, b.hover?.color]);
const buttons = Object.values(all.buttons.reduce((m, b) => { const k = btnKey(b); m[k] ??= { ...b, examples: [] }; m[k].examples.push(`${b.page}: ${b.label}`); return m; }, {}))
  .map(({ page, label, ...b }) => ({ ...b, uses: b.examples.length, examples: b.examples.slice(0, 5) })).sort((a, b) => b.uses - a.uses);
const theme = existsSync(OUT + "brand/computed-styles.json") ? JSON.parse(readFileSync(OUT + "brand/computed-styles.json", "utf8")).vars ?? {} : {};
save("brand/tokens.json", JSON.stringify({
  source: `${BASE}, desktop 1440px, pages: ${PAGES.join(", ")}`,
  theme_palette: theme,
  colours_by_role: {
    section_backgrounds: count(secs.map((s) => s.bg)).map(([c, n]) => ({ colour: c, sections: n, pages: [...new Set(secs.filter((s) => s.bg === c).map((s) => s.page))] })),
    section_background_images: [...new Set(secs.flatMap((s) => s.bgImages))].map((id) => ({ id, file: local(id), pages: [...new Set(secs.filter((s) => s.bgImages.includes(id)).map((s) => s.page))] })),
    heading_text: count(items.filter((i) => i.heads?.length).map((i) => i.color)),
    body_text: count(items.filter((i) => i.kind === "text").map((i) => i.color)),
    header: { background: nav.headerAtTop.bg, underlay: nav.headerAtTop.underlay, menu_text: count(nav.menu.map((m) => m.color)), menu_hover: nav.menuHover },
    footer_backgrounds: count(nav.footer.map((s) => s.bg)),
    footer_text: count(nav.footer.flatMap((s) => s.rows.flat()).filter((i) => i.color).map((i) => i.color)),
  },
  buttons,
  layout: {
    viewport: 1440,
    content_width_px: { median: median(secs.filter((s) => s.content).map((s) => s.content.width)), max: Math.max(...secs.filter((s) => s.content).map((s) => s.content.width)) },
    content_left_px_median: median(secs.filter((s) => s.content).map((s) => s.content.left)),
    section_padding_px: { top_median: median(secs.filter((s) => s.padding).map((s) => s.padding.top)), bottom_median: median(secs.filter((s) => s.padding).map((s) => s.padding.bottom)) },
    horizontal_gaps_px: count(secs.flatMap((s) => s.gaps).map(String)).slice(0, 8),
    wix_columns: secs.flatMap((s) => s.cols.map((c) => ({ page: s.page, section: s.n, ...c }))),
    header_height_px: { desktop: nav.headerAtTop.height, mobile: nav.mobileHeader.height },
  },
}, null, 1) + "\n");
console.log("done");
