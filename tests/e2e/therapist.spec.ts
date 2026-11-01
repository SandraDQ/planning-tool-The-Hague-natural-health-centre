import { expect, test, type Page } from "@playwright/test";
import { addDays, amsDay, mondayOf, nextWeekdayAfterToday, resetDemo, shot, signIn, watchErrors } from "./helpers";

/*
 * Therapist dashboard on a phone (master prompt 7, 15).
 * Anna de Vries: private room 3, Mon/Tue/Thu 09–17. Daan Bakker: shared rooms through weekly blocks.
 */
const APPT = /^\d\d:\d\d /; // appointment cards: "09:00 Yara Short session 30 min"

async function openDay(page: Page, day: string) {
  await page.goto(`/en/therapist?week=${mondayOf(day)}&day=${day}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("therapist @mobile", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("sign in as demo therapist → calendar shows appointments", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Demo – Anna de Vries");
    await expect(page).toHaveURL(/\/en\/therapist$/);
    await expect(page.getByText(/Demo/).first()).toBeVisible(); // demo banner
    // Last week's Thursday always has seeded appointments for Anna.
    const lastThu = addDays(mondayOf(amsDay()), -4);
    await openDay(page, lastThu);
    await expect(page.getByRole("button", { name: APPT }).first()).toBeVisible();
    await shot(page, "therapist-calendar-day", testInfo);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Week \d+$/ })).toBeVisible();
    await shot(page, "therapist-calendar-week", testInfo);
    expect(errors).toEqual([]);
  });

  test("add a manual booking", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Anna de Vries");
    // Monday three weeks ahead: a working day past the seeded appointments (seen fully booked on Sundays otherwise).
    const day = addDays(mondayOf(amsDay()), 21);
    await openDay(page, day);
    const before = await page.getByRole("button", { name: APPT }).count();
    await page.getByRole("button", { name: /^(Booking|Add booking)$/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Add a booking" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Date")).toHaveValue(day);
    await sheet.getByRole("button", { name: /^\d\d:\d\d$/ }).first().click();
    await sheet.getByLabel("First name").fill("Manual");
    await sheet.getByLabel("Last name").fill("Qa");
    await sheet.getByLabel("E-mail").fill("manual.qa@example.invalid");
    await sheet.getByLabel("Phone").fill("0611111111");
    await shot(page, "therapist-manual-booking-sheet", testInfo);
    await sheet.getByRole("button", { name: "Save booking" }).click();
    await expect(page.getByText("Booking added")).toBeVisible();
    await expect(page.getByRole("button", { name: /Manual/ })).toBeVisible();
    expect(await page.getByRole("button", { name: APPT }).count()).toBe(before + 1);
    await shot(page, "therapist-manual-booking-saved", testInfo);
  });

  test("record a balance payment", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Anna de Vries");
    const lastThu = addDays(mondayOf(amsDay()), -4);
    await openDay(page, lastThu);
    await page.getByRole("button", { name: APPT }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Payment" }).click();
    const pay = page.getByRole("dialog", { name: "Record a payment" });
    await expect(pay.getByLabel("Amount")).not.toHaveValue("");
    await pay.getByLabel("Paid with").selectOption({ label: "Cash" });
    await pay.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment saved")).toBeVisible();
    await shot(page, "therapist-payment-saved", testInfo);
    // Gap check (dashboards handoff #2): once paid, the sheet should not offer the full balance again.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: APPT }).first().click();
    const again = page.getByRole("dialog");
    await expect.soft(again.getByText("€0.00"), "still-to-pay is €0.00 after recording the balance").toBeVisible({ timeout: 3000 });
  });

  test("mark a started appointment as no-show", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Anna de Vries");
    // Seeded: days of this week before today stay "confirmed", as if not marked yet; older ones are "done".
    // Both can be marked as no-show once the session has started (the button is hidden before that).
    const today = amsDay();
    let found = false;
    for (let d = mondayOf(today); d <= today && !found; d = addDays(d, 1)) {
      await openDay(page, d);
      const cards = page.getByRole("button", { name: APPT });
      for (let i = 0; i < (await cards.count()); i++) {
        await cards.nth(i).click();
        const sheet = page.getByRole("dialog");
        if (await sheet.getByText(/^(Confirmed|Done)$/).count()) {
          const noShow = sheet.getByRole("button", { name: "No-show" });
          if (await noShow.count()) {
            await noShow.click();
            const confirm = page.getByRole("dialog", { name: "Mark as no-show?" });
            await confirm.getByRole("button", { name: "Mark as no-show" }).click();
            await expect(page.getByText("Marked as no-show")).toBeVisible();
            await shot(page, "therapist-no-show", testInfo);
            found = true;
            break;
          }
        }
        await page.keyboard.press("Escape");
      }
    }
    test.skip(!found, "No confirmed or done appointment that has already started this week (e.g. the run is early on a Monday).");
  });

  test("a future appointment cannot be marked as no-show", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Anna de Vries");
    const day = nextWeekdayAfterToday([1, 2, 4], 2);
    await openDay(page, day);
    await page.getByRole("button", { name: APPT }).first().click();
    const sheet = page.getByRole("dialog");
    // No-show and payment only appear once the session has started; a hint says so.
    await expect(sheet.getByText(/Once the session has started, you can mark a no-show/)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "No-show" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Payment", exact: true })).toHaveCount(0);
    await shot(page, "therapist-no-show-future", testInfo);
  });

  test("reserve a block and release it", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Daan Bakker");
    await page.goto("/en/therapist/blocks");
    await page.getByRole("button", { name: "Reserve a block" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Reserve a block" });
    const day = nextWeekdayAfterToday([2, 4], 7); // Daan has no weekly blocks on Tue/Thu in the seed
    await sheet.getByRole("textbox", { name: "Day", exact: true }).fill(day);
    const free = sheet.getByRole("radio", { name: /Free$/ }).first();
    await expect(free).toBeEnabled();
    const label = await free.evaluate((el: HTMLInputElement) => el.labels?.[0]?.textContent ?? el.closest("label")?.textContent ?? el.getAttribute("aria-label") ?? "");
    await free.check({ force: true });
    const weekly = sheet.getByRole("checkbox", { name: /Every week/ });
    if (await weekly.isChecked()) await weekly.uncheck({ force: true });
    await expect(sheet.getByText(/sessions? fits? in this block|No sessions fit/)).toBeVisible();
    await shot(page, "therapist-reserve-sheet", testInfo);
    await sheet.getByRole("button", { name: "Reserve", exact: true }).click();
    await expect(page.getByText("Block reserved")).toBeVisible();

    const m = /Room (\d+) · (\d\d:\d\d)–(\d\d:\d\d)/.exec(label);
    expect(m, `radio label "${label}"`).not.toBeNull();
    const dayNum = String(Number(day.slice(8)));
    const row = page
      .getByText(new RegExp(`^Room ${m![1]} · no appointments yet$`))
      .locator("xpath=ancestor::li[1]")
      .filter({ has: page.getByText(dayNum, { exact: true }) })
      .filter({ has: page.getByText(`${m![2]}–${m![3]}`, { exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByText(/no appointments yet/)).toBeVisible();
    await row.getByRole("button", { name: "Release" }).click();
    const release = page.getByRole("dialog");
    await release.getByRole("button", { name: "Release block" }).click();
    await expect(page.getByText("Block released")).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test("a block with bookings can't be released", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Daan Bakker");
    await page.goto("/en/therapist/blocks");
    const row = page.getByText(/^Room \d+ · [1-9]\d* appointments?$/).first().locator("xpath=ancestor::li[1]");
    await row.getByRole("button", { name: "Release" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/This block has \d+ bookings?/)).toBeVisible();
    await expect(sheet.getByText("Move or cancel those appointments first, then release the block.")).toBeVisible();
    const btn = sheet.getByRole("button", { name: "Release block" });
    if (await btn.count()) await expect(btn).toBeDisabled();
    await shot(page, "therapist-release-blocked", testInfo);
  });

  test("calendar link: subscribe feed works and a reset retires the old link", async ({ page, request }, testInfo) => {
    await signIn(page, "Demo – Anna de Vries");
    await page.goto("/en/therapist/settings/calendar");
    await expect(page.getByRole("link", { name: "Apple Calendar (iPhone, iPad, Mac)" })).toHaveAttribute("href", /^webcal:\/\//);
    const field = page.getByLabel("Your private calendar link");
    const oldLink = await field.inputValue();
    const feed = await request.get(oldLink);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    const body = await feed.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).not.toMatch(/@example\.invalid/);
    await shot(page, "therapist-calendar-link", testInfo);

    await page.getByRole("button", { name: "Make a new link" }).click();
    await expect(page.getByText("Done: you have a new link.")).toBeVisible();
    const newLink = await field.inputValue();
    expect(newLink).not.toBe(oldLink);
    expect((await request.get(newLink)).status()).toBe(200);
    // In-memory demo state lives per server instance; the E2E server is a single instance.
    expect((await request.get(oldLink)).status()).toBe(404);
  });

  test("setup steps: progress, status per step and a button to each screen", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Demo – Anna de Vries");
    await page.goto("/en/therapist/settings");
    await page.getByRole("link", { name: /Set up your practice/ }).click();
    await expect(page).toHaveURL(/\/en\/therapist\/setup$/);
    await expect(page.getByRole("heading", { level: 1, name: "Set up your practice" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Setup progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your treatments and prices" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Online payments" })).toBeVisible();
    await expect(page.getByText("Coming soon")).toBeVisible();
    await shot(page, "therapist-setup", testInfo);
    await page.getByRole("link", { name: /^(Add a treatment|View or change)$/ }).first().click();
    await expect(page).toHaveURL(/\/en\/therapist\/settings\/profile$|\/en\/therapist\/settings\/services$/);
    expect(errors).toEqual([]);
  });
});
