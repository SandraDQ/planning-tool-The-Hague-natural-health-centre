import { expect, test } from "@playwright/test";
import { addDays, amsDay, holdFromTimeStep, mondayOf, resetDemo, shot, signIn, slotsOn, watchErrors } from "./helpers";

/*
 * Client booking flow (master prompt 5, 8A quality bar, 15 "Payments").
 * Phone viewport only. Uses Bram's 60-minute massage (Tue–Fri, private room 4).
 */
const ST = "st-bram-60";

test.describe("booking @mobile", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("guest books home → confirmed within 5 screens and 2 minutes; the slot then disappears", async ({ page, browser }, testInfo) => {
    const errors = watchErrors(page);
    const screens: string[] = [];
    page.on("framenavigated", (f) => {
      if (f !== page.mainFrame()) return;
      const p = new URL(f.url()).pathname;
      if (screens[screens.length - 1] !== p) screens.push(p);
    });
    const t0 = Date.now();
    await page.goto("/en");
    await shot(page, "booking-00-home", testInfo);
    // Header "Book" or the hero button, whichever is first; both go to /book.
    await page.getByRole("main").getByRole("link", { name: "Book an appointment" }).first().click();
    await expect(page).toHaveURL(/\/en\/book$/);
    await shot(page, "booking-01-choose", testInfo);
    await page.getByRole("link", { name: /^Choose Relaxation massage, Massage 60 min/ }).click();
    await expect(page).toHaveURL(/\/en\/book\/time/);
    await shot(page, "booking-02-time", testInfo);

    const held = await holdFromTimeStep(page, ST);
    await shot(page, "booking-04-pay", testInfo);
    await expect(page.getByText("Demo payment — no money moves")).toBeVisible();
    await page.getByRole("button", { name: "Pay with iDEAL (demo)" }).click();
    await expect(page).toHaveURL(/\/en\/book\/confirmed\//);
    await expect(page.getByRole("heading", { name: "Your appointment is booked" })).toBeVisible();
    await expect(page.getByText("What happens next")).toBeVisible();
    await shot(page, "booking-05-confirmed", testInfo);
    const seconds = (Date.now() - t0) / 1000;

    const afterHome = screens.slice(screens.indexOf("/en") + 1);
    testInfo.annotations.push({ type: "screens", description: `${afterHome.length}: ${afterHome.join(" → ")} in ${seconds.toFixed(1)}s` });
    expect(afterHome.length, afterHome.join(" → ")).toBeLessThanOrEqual(5);
    expect(seconds).toBeLessThan(120);
    expect(errors).toEqual([]);

    // A second visitor no longer sees that time.
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await other.newPage();
    const left = await slotsOn(p2, "en", ST, held.day);
    expect(left, `slot ${held.day} ${held.time} should be gone`).not.toContain(held.time);
    await other.close();
  });

  test("'Payment fails' frees the slot", async ({ page, browser }, testInfo) => {
    await page.goto(`/en/book/time?st=${ST}`);
    const held = await holdFromTimeStep(page, ST);
    // While held, others don't see it.
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await other.newPage();
    expect(await slotsOn(p2, "en", ST, held.day)).not.toContain(held.time);

    await page.getByRole("button", { name: "Payment fails" }).click();
    await expect(page.getByText("The payment did not go through")).toBeVisible();
    await shot(page, "booking-pay-failed", testInfo);
    expect(await slotsOn(p2, "en", ST, held.day), "slot is free again after a failed payment").toContain(held.time);
    await other.close();
  });

  test("'Abandon' frees the slot", async ({ page, browser }, testInfo) => {
    await page.goto(`/en/book/time?st=${ST}`);
    const held = await holdFromTimeStep(page, ST);
    await page.getByRole("button", { name: "Abandon" }).click();
    await page.waitForURL(/status=abandoned/);
    await shot(page, "booking-pay-abandoned", testInfo);
    // Abandon releases the hold (actions.ts), so the page should say so — not "15 minutes have passed".
    await expect.soft(page.getByText("You left the payment"), "abandon message").toBeVisible();
    await expect.soft(page.getByText("The 15 minutes to pay have passed"), "abandon shows the expiry text").toHaveCount(0);
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await other.newPage();
    expect(await slotsOn(p2, "en", ST, held.day), "slot is free again after abandon").toContain(held.time);
    await other.close();
  });

  test("hold expiry: after 15 minutes the pay page offers 'Choose a time again' (browser clock only)", async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: "note",
      description:
        "Only the browser clock is moved. The server's demo store uses the real clock and cannot be shifted from a test, so the server-side release after 15 min is covered by the store unit tests, not here.",
    });
    await page.clock.install();
    await page.goto(`/en/book/time?st=${ST}`);
    await holdFromTimeStep(page, ST);
    await expect(page.getByText("Time left to pay")).toBeVisible();
    await page.clock.fastForward("16:00");
    await expect(page.getByText("Your time is no longer held")).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose a time again" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay with iDEAL (demo)" })).toHaveCount(0);
    await shot(page, "booking-hold-expired-ui", testInfo);
  });

  test("hold expiry on the server frees the slot", async () => {
    test.skip(true, "Needs a way to move the demo server's clock (no test hook in the production build). Covered by src/lib/server/demo/store.test.ts.");
  });

  test("returning demo client gets prefilled details", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Lotte Willems");
    await page.goto(`/en/book/time?st=${ST}`);
    const slot = page.getByRole("button", { name: /^\d\d:\d\d$/ }).first();
    await slot.click();
    await page.getByRole("link", { name: "Continue" }).last().click();
    await expect(page).toHaveURL(/\/book\/details/);
    await expect(page.getByText(/Signed in as .*We filled in your details/)).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).not.toHaveValue("");
    await expect(page.locator('input[name="lastName"]')).not.toHaveValue("");
    await expect(page.locator('input[name="email"]')).not.toHaveValue("");
    await expect(page.locator('input[name="phone"]')).not.toHaveValue("");
    // New/returning is worked out, not asked.
    await expect(page.locator('input[name="clientKind"]')).toHaveCount(0);
    await shot(page, "booking-prefilled", testInfo);
  });

  test("client books, cancels on time and sees the refund amount", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Lotte Willems");
    // Two weeks out: well inside any notice period.
    const monday = addDays(mondayOf(amsDay()), 14);
    await page.goto(`/en/book/time?st=${ST}&week=${monday}`);
    await page.getByRole("button", { name: /^\d\d:\d\d$/ }).first().waitFor();
    // If the requested week has no day selected yet, pick the first available day.
    if ((await page.getByRole("button", { name: /^\d\d:\d\d$/ }).count()) === 0) {
      await page.getByRole("group", { name: "Choose a day" }).getByRole("button", { disabled: false }).first().click();
    }
    await holdFromTimeStep(page, ST, { prefilled: true });
    await page.getByRole("button", { name: "Pay with iDEAL (demo)" }).click();
    await expect(page.getByRole("heading", { name: "Your appointment is booked" })).toBeVisible();

    await page.goto("/en/account");
    await expect(page.getByRole("heading", { name: "My appointments" })).toBeVisible();
    const cancelButtons = page.getByRole("button", { name: "Cancel appointment" });
    await expect(cancelButtons.first(), "client area has a Cancel button").toBeVisible();
    // The newest upcoming booking is the one two weeks out; take the last upcoming one (sorted by date).
    await cancelButtons.last().click();
    const consequence = page.getByText(/You are cancelling in time, so your deposit of €\s?20\.00 is refunded/);
    await expect(consequence).toBeVisible();
    await shot(page, "booking-cancel-confirm", testInfo);
    const item = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Yes, cancel" }) });
    const when = (await item.locator("p").first().textContent())!.trim();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    // The appointment is now cancelled (core requirement).
    const cancelledItem = page.getByRole("listitem").filter({ hasText: when });
    await expect(cancelledItem.getByText("Cancelled", { exact: true })).toBeVisible();
    await shot(page, "booking-cancelled", testInfo);
    // After confirming, the client should be told it worked and how much comes back.
    await expect.soft(page.getByText("Your appointment is cancelled."), "success message after cancel").toBeVisible({ timeout: 3000 });
    await expect.soft(page.getByText(/€\s?20\.00.*(refund|back)/i), "refund amount shown after cancel").toBeVisible({ timeout: 3000 });
    // A future appointment that was cancelled should not be filed under "Past".
    await expect.soft(page.getByRole("region", { name: "Past" }).getByText(when), "cancelled future appointment listed under Past").toHaveCount(0);
  });
});
