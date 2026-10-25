// Shared helpers for exporting the PUBLIC Wix website (plain GETs + headless Chromium, no API, no .env).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const BASE = "https://www.thehague-naturalhealthcentre.com";
export const OUT = new URL("../../wix-export/", import.meta.url).pathname;
export const UA = "THNHC-site-export/1.0 (owner's own site migration; polite, read-only)";
export const { chromium, devices } = createRequire(import.meta.url)("playwright");

export function save(rel, data) {
  const p = OUT + rel;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  return p;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with retries; returns Response. Only ever GET.
export async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok || i >= tries) return res;
    } catch (e) {
      if (i >= tries) throw e;
    }
    await sleep(1000 * i);
  }
}

// Run fn over items with at most `n` in flight.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, b]) => ({
    url: b.match(/<loc>(.*?)<\/loc>/)?.[1],
    lastmod: b.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? "",
    image: b.match(/<image:loc>(.*?)<\/image:loc>/)?.[1] ?? "",
  }));
}

export const pathOf = (url) => new URL(url).pathname || "/";
export const slugOf = (url) => pathOf(url).split("/").filter(Boolean).pop() || "home";

// static.wixstatic.com/media/<id>/v1/fill/... -> original file URL (no resize/crop).
export const originalImage = (src) =>
  src && src.includes("static.wixstatic.com/media/")
    ? decodeURIComponent(src).replace(/(\/media\/[^/]+?)\/v1\/.*$/, "$1")
    : src;

// Hide the cookie banner with CSS instead of clicking anything.
export const HIDE_CHROME_CSS = `[data-hook="consent-banner-root"],#consent-banner-root{display:none!important}`;

export async function openPage(page, url) {
  // Wix blog pages never reach network idle, so wait for load and give idle at most 10s.
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  await autoScroll(page);
}

// Scroll to the bottom in steps so lazy images/sections render, then back to top.
export async function autoScroll(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await wait(200);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await wait(800);
  });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

// Runs in the browser: converts visible DOM under `root` to Markdown.
// Skips comment/member/guest widgets so no visitor personal data is captured.
export function domToMarkdown(rootSel) {
  const SKIP = 'script,style,noscript,svg,template,[data-hook*="comment" i],[data-hook*="member" i],[data-hook*="guest" i],[data-hook*="attendee" i],[data-hook*="avatar" i],[data-hook*="consent-banner"]';
  const orig = (s) => s && s.includes("static.wixstatic.com/media/")
    ? decodeURIComponent(s).replace(/(\/media\/[^/]+?)\/v1\/.*$/, "$1") : s;
  const clean = (t) => t.replace(/[​­]/g, "").replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const shown = (el) => {
    if (el.matches(SKIP)) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    // Wix containers can be 0x0 while their children overflow, so only images must have a size.
    if (el.tagName !== "IMG") return true;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const img = (el) => {
    const src = el.currentSrc || el.src;
    if (!src || src.startsWith("data:")) return "";
    return `![${clean(el.alt || "").trim()}](${orig(src)})`;
  };
  const oneLine = (x) => x.replace(/\s*\n\s*/g, " ").trim();
  const inline = (el) => {
    let s = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { s += n.textContent; continue; }
      if (n.nodeType !== 1 || !shown(n)) continue;
      const t = n.tagName;
      if (t === "BR") s += "\u0001";
      else if (t === "UL" || t === "OL") continue;
      else if (t === "IMG") s += img(n);
      else if (t === "A" && n.getAttribute("href")) {
        const x = oneLine(inline(n));
        s += x ? `[${x}](${n.href})` : "";
      } else if (t === "STRONG" || t === "B") { const x = inline(n).trim(); s += x ? ` **${x}** ` : ""; }
      else if (t === "EM" || t === "I") { const x = inline(n).trim(); s += x ? ` _${x}_ ` : ""; }
      else s += /^(inline|contents)/.test(getComputedStyle(n).display) ? inline(n) : `\n${inline(n)}\n`;
    }
    // Block children become separate lines; <br> becomes a Markdown hard break.
    return clean(s).replace(/ *\n[\s]*/g, "\n").replace(/ *\u0001 */g, "  \n").trim();
  };
  const out = [];
  const push = (s) => { s = s.trim(); if (s && out[out.length - 1] !== s) out.push(s); };
  // Lists come out as one block (single newlines) so they read as Markdown lists.
  const list = (el, depth = 0, lines = []) => {
    let i = 1;
    for (const li of el.children) {
      if (li.tagName !== "LI" || !shown(li)) continue;
      const text = inline(li);
      const pad = "  ".repeat(depth);
      if (text) lines.push(`${pad}${el.tagName === "OL" ? `${i++}.` : "-"} ${text.replace(/\n/g, `\n${pad}  `)}`);
      for (const sub of li.querySelectorAll(":scope > ul, :scope > ol, :scope > * > ul, :scope > * > ol")) list(sub, depth + 1, lines);
    }
    if (depth === 0) push(lines.join("\n"));
  };
  const BLOCKY = "p,h1,h2,h3,h4,h5,h6,ul,ol,img,iframe,video,div";
  const walk = (el) => {
    if (!shown(el)) return;
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) return push(`${"#".repeat(+t[1])} ${oneLine(inline(el))}`);
    if (t === "P" || t === "BLOCKQUOTE" || t === "FIGCAPTION") return push(t === "BLOCKQUOTE" ? `> ${inline(el)}` : inline(el));
    if (t === "UL" || t === "OL") return list(el, 0);
    if (t === "IMG") return push(img(el));
    // Embeds: keep only origin + path (query strings carry Wix instance tokens); skip reCAPTCHA.
    if (t === "IFRAME") {
      if (!/^https?:/.test(el.src) || /recaptcha/i.test(el.src + el.title)) return;
      const u = new URL(el.src);
      return push(`[Embedded: ${el.title || "iframe"}](${u.origin}${u.pathname})`);
    }
    if (t === "VIDEO") return push(`[Video](${el.currentSrc || el.src})`);
    if (t === "HR") return push("---");
    if (t === "A" && el.getAttribute("href")) {
      if (!el.querySelector(BLOCKY)) return push(inline(wrap(el)));
      const imgs = [...el.querySelectorAll("img")];
      if (imgs.length === 1 && !el.innerText.trim()) return push(`[${img(imgs[0])}](${el.href})`);
      [...el.children].forEach(walk);
      return push(`(link: ${el.href})`);
    }
    if (t === "BUTTON") { const x = clean(el.innerText).trim(); return x && push(`[Button: ${x}]`); }
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && clean(n.textContent).trim());
    if (hasText) return push(inline(el));
    [...el.children].forEach(walk);
  };
  // Wrap a lone <a> so inline() renders it as a link.
  const wrap = (a) => ({ childNodes: [a] });
  const root = document.querySelector(rootSel);
  if (root) walk(root);
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

export async function pageMeta(page) {
  return page.evaluate(() => {
    // Published date + author from schema.org data (blog posts); author is staff, not a visitor.
    const ld = () => {
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(s.textContent);
          if (j.datePublished) return { published: j.datePublished, author: [j.author].flat()[0]?.name ?? "" };
        } catch {}
      }
      return {};
    };
    const m = (sel) => document.querySelector(sel)?.getAttribute("content") ?? "";
    return {
      title: document.title,
      description: m('meta[name="description"]'),
      ogImage: m('meta[property="og:image"]'),
      language: document.documentElement.lang || "",
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
      robots: m('meta[name="robots"]'),
      ...ld(),
    };
  });
}

export const yamlStr = (s) => JSON.stringify(String(s ?? ""));
