import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";

/** Screenshots for the QA handoff (network mount). Falls back to test-results when it isn't there. */
export const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "/mnt/project-files/thnhc-plan/mvp/qa/";

export async function shot(page: Page, name: string, testInfo?: TestInfo) {
  const project = testInfo?.project.name ?? "x";
  let dir = SHOT_DIR;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    dir = "test-results/e2e-shots/";
    mkdirSync(dir, { recursive: true });
  }
  const file = path.join(dir, `${project}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

/** Collects console errors and uncaught page errors. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export type Locale = "nl" | "en";

/** Demo sign-in through /[locale]/login. `who` is the name on the button, e.g. "Owner (admin)" or "Demo – Anna de Vries". */
export async function signIn(page: Page, who: string, locale: Locale = "en") {
  await page.goto(`/${locale}/login`);
  const label = locale === "en" ? `Log in as ${who}` : new RegExp(`${escapeRe(who)}$`);
  await page.getByRole("button", { name: label }).first().click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}

export async function signOutAll(page: Page) {
  await page.context().clearCookies();
}

/** Sign in as the owner and press "Reset demo data", then sign out. Gives every spec the same seed. */
export async function resetDemo(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, "Owner (admin)");
  await page.goto("/en/login");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByText("The demo data has been reset.")).toBeVisible();
  await ctx.close();
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------- Dates in Europe/Amsterdam ---------- */

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Amsterdam for a Date. */
export function amsDay(d: Date = new Date()): string {
  return fmt.format(d);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a YYYY-MM-DD. */
export function weekday(day: string): number {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

export function mondayOf(day: string): string {
  return addDays(day, 1 - weekday(day));
}

/** The first day strictly after today (Amsterdam) that falls on one of the given ISO weekdays. */
export function nextWeekdayAfterToday(days: number[], offset = 1): string {
  let d = addDays(amsDay(), offset);
  while (!days.includes(weekday(d))) d = addDays(d, 1);
  return d;
}

/** A weekday in the current week before today, or in last week (seeded "confirmed, not marked yet" or completed). */
export function pastWeekday(days: number[]): string {
  let d = addDays(amsDay(), -1);
  while (!days.includes(weekday(d))) d = addDays(d, -1);
  return d;
}

/* ---------- Booking flow ---------- */

export const SLOT_NAME = /^\d\d:\d\d$/;

export type HeldBooking = { sessionTypeId: string; day: string; time: string; startIso: string; payUrl: string };

/**
 * Time step → details → hold. Starts on /book/time?st=… and stops on the demo payment page.
 * Returns what was chosen, so a second visitor can look for the same slot.
 */
export async function holdFirstSlot(
  page: Page,
  sessionTypeId: string,
  opts: { locale?: Locale; prefilled?: boolean; client?: { first: string; last: string; email: string; phone: string } } = {},
): Promise<HeldBooking> {
  const locale = opts.locale ?? "en";
  await page.goto(`/${locale}/book/time?st=${sessionTypeId}`);
  return holdFromTimeStep(page, sessionTypeId, opts);
}

export async function holdFromTimeStep(
  page: Page,
  sessionTypeId: string,
  opts: { prefilled?: boolean; client?: { first: string; last: string; email: string; phone: string } } = {},
): Promise<HeldBooking> {
  const slot = page.getByRole("button", { name: SLOT_NAME }).first();
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await page.getByRole("link", { name: /^(Continue|Verder|Doorgaan)$/ }).last().click();
  await page.waitForURL(/\/book\/details/);
  const startIso = new URL(page.url()).searchParams.get("start")!;
  const day = amsDay(new Date(startIso));
  if (!opts.prefilled) {
    const c = opts.client ?? { first: "Qa", last: "Tester", email: `qa.${Date.now()}@example.invalid`, phone: "0612345678" };
    await fillDetails(page, c);
  } else {
    await page.getByLabel(/Reason for your visit|Reden/).fill("QA: returning client check");
  }
  await page.locator('input[name="acceptedPolicy"]').check();
  await page.locator('input[name="healthDataConsent"]').check();
  await page.getByRole("button", { name: /Continue to deposit|aanbetaling/i }).click();
  await page.waitForURL(/\/book\/pay\//);
  return { sessionTypeId, day, time, startIso, payUrl: page.url() };
}

export async function fillDetails(page: Page, c: { first: string; last: string; email: string; phone: string }) {
  await page.locator('input[name="firstName"]').fill(c.first);
  await page.locator('input[name="lastName"]').fill(c.last);
  await page.locator('input[name="email"]').fill(c.email);
  await page.locator('input[name="phone"]').fill(c.phone);
  await page.locator('textarea[name="reason"], input[name="reason"]').fill("QA: general relaxation");
  const newClient = page.locator('input[name="clientKind"][value="new"]');
  if (await newClient.count()) await newClient.check({ force: true });
}

/** Slot labels offered on the time step for one day. */
export async function slotsOn(page: Page, locale: Locale, sessionTypeId: string, day: string): Promise<string[]> {
  await page.goto(`/${locale}/book/time?st=${sessionTypeId}&week=${mondayOf(day)}&day=${day}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return (await page.getByRole("button", { name: SLOT_NAME }).allTextContents()).map((s) => s.trim());
}

/** No element wider than the viewport. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
}
