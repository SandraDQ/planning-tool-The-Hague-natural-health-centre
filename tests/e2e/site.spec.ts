import { expect, test } from "@playwright/test";
import { horizontalOverflow, shot, watchErrors } from "./helpers";

/** Menu pages plus footer/header targets that the old site had, in both languages. */
const PAGES = ["", "/kopie-van-therapies", "/kopie-van-conditions", "/about-us", "/events", "/blog", "/contact", "/privacy", "/booking", "/login", "/book"];
const LOCALES = ["nl", "en"] as const;

test.describe("site", () => {
  for (const locale of LOCALES) {
    for (const p of PAGES) {
      test(`${locale}${p || "/"} loads, has the logo and no console errors`, async ({ page }, testInfo) => {
        const errors = watchErrors(page);
        const res = await page.goto(`/${locale}${p}`);
        expect(res?.status(), "HTTP status").toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

        // Logo: the header's home link holds the original logo image, and it actually loaded.
        const logo = page.locator("header").first().locator("img:visible").first();
        await expect(logo).toBeVisible();
        const loaded = await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
        expect(loaded, "logo image loaded").toBe(true);
        expect(await logo.getAttribute("src")).toMatch(/logo/i);

        await page.waitForLoadState("networkidle");
        if (errors.length) await shot(page, `site-errors-${locale}${p.replace(/\//g, "_") || "_home"}`, testInfo);
        expect(errors, "console / page errors").toEqual([]);
      });
    }
  }

  test("menu links work (desktop) @desktop", async ({ page }) => {
    await page.goto("/en");
    const nav = page.getByRole("navigation", { name: /main menu|hoofdmenu/i });
    const links = nav.getByRole("link");
    const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThanOrEqual(7);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBe(200);
    }
  });

  test("mobile menu opens and links to every page @mobile", async ({ page }) => {
    await page.goto("/nl");
    await page.getByRole("button", { name: "Menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const name of ["Home", "Therapieën", "Klachten", "Over ons", "Evenementen", "Blog", "Contact"]) {
      await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await dialog.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/\/nl\/contact$/);
  });

  test("old Wix URL /copy-of-meditation-video redirects to home", async ({ page, request }) => {
    const res = await request.get("/copy-of-meditation-video", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/");
    await page.goto("/copy-of-meditation-video");
    await expect(page).toHaveURL(/\/(nl|en)\/?$/);
    for (const locale of ["nl", "en"]) {
      const r = await request.get(`/${locale}/copy-of-meditation-video`, { maxRedirects: 0 });
      expect(new URL(r.headers()["location"], "http://x").pathname).toBe(`/${locale}`);
    }
  });

  test("other old Wix URLs redirect to /en", async ({ request }) => {
    for (const [from, to] of [
      ["/about-us", "/en/about-us"],
      ["/kopie-van-therapies", "/en/kopie-van-therapies"],
      ["/booking-calendar/anything", "/en/book"],
      ["/therapies", "/en/kopie-van-therapies"],
    ]) {
      const r = await request.get(from, { maxRedirects: 0 });
      expect([301, 308], from).toContain(r.status());
      expect(new URL(r.headers()["location"], "http://x").pathname, from).toBe(to);
    }
  });

  test("no horizontal overflow at 360px @mobile", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const bad: string[] = [];
    for (const locale of LOCALES) {
      for (const p of [...PAGES, "/services-1", "/book/time?st=st-bram-60"]) {
        await page.goto(`/${locale}${p}`);
        await page.waitForLoadState("networkidle");
        const { scrollWidth, clientWidth } = await horizontalOverflow(page);
        if (scrollWidth > clientWidth) {
          bad.push(`/${locale}${p}: ${scrollWidth} > ${clientWidth}`);
          await shot(page, `overflow-360-${locale}${p.replace(/[/?=&]/g, "_")}`, testInfo);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
