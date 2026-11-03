import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { holdFirstSlot, resetDemo, signIn } from "./helpers";

/*
 * Confirmation e-mails (demo outbox): a therapist writes their own message, a client
 * books and pays, and the admin sees the e-mail in the outbox with that message in it.
 */

async function axe(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).setLegacyMode(true).exclude("iframe").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(bad.map((v) => `${v.impact}: ${v.id} — ${v.help}`), `axe on ${name}`).toEqual([]);
}

test.describe("confirmation e-mails", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("therapist message ends up in the client's confirmation", async ({ page }, testInfo) => {
    await signIn(page, "Demo – Daan Bakker");
    await page.goto("/en/therapist/settings");
    await page.getByRole("link", { name: /Confirmation e-mail/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Confirmation e-mail" })).toBeVisible();
    await expect(page.getByText("How this works")).toBeVisible();
    const english = page.getByLabel("Message in English");
    await expect(english).toHaveValue(/Thank you for your booking/);
    await english.fill("Lovely that you're coming.\n\nPlease wear comfortable clothes.");
    await expect(page.frameLocator('iframe[title="Example of the confirmation e-mail"]').getByText("Please wear comfortable clothes.")).toBeVisible();
    await page.getByRole("button", { name: "Save my message" }).click();
    await expect(page.getByText("Your message is saved")).toBeVisible();
    await axe(page, "therapist-emails");
    await page.screenshot({ path: testInfo.outputPath("therapist-emails.png"), fullPage: true });

    await page.context().clearCookies();
    const email = `mila.${Date.now()}@example.invalid`;
    await holdFirstSlot(page, "st-daan-60", { client: { first: "Mila", last: "Jansen", email, phone: "0612345678" } });
    await page.getByRole("button", { name: "Pay with iDEAL (demo)" }).click();
    await page.waitForURL(/\/book\/confirmed\//);

    await signIn(page, "Owner (admin)");
    await page.goto("/en/admin/emails");
    await expect(page.getByText("Not connected yet")).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: email }).filter({ hasText: "Booking confirmation" });
    await expect(row).toHaveCount(1);
    // The deposit invoice went out too; the admin sees that it was sent, not what is in it (D31).
    const invoiceRow = page.getByRole("listitem").filter({ hasText: email }).filter({ hasText: "Invoice to a client" });
    await expect(invoiceRow).toHaveCount(1);
    await expect(invoiceRow).not.toContainText("deposit invoice");
    await row.getByRole("button", { name: "View" }).click();
    const mail = page.frameLocator('iframe[title^="Your appointment on"]');
    await expect(mail.getByText("Dear Mila,")).toBeVisible();
    await expect(mail.getByText("Please wear comfortable clothes.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("admin-email-view.png") });
    // The therapist also got a short "new booking" e-mail.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listitem").filter({ hasText: "New booking (to therapist)" })).toHaveCount(1);
    // The client's cancel link works without an account.
    await row.getByRole("button", { name: "View" }).click();
    const href = await mail.getByRole("link", { name: "Cancel my appointment online" }).getAttribute("href");
    await page.keyboard.press("Escape");
    await axe(page, "admin-emails");
    await page.screenshot({ path: testInfo.outputPath("admin-emails.png"), fullPage: true });

    await page.context().clearCookies();
    await page.goto(new URL(href!).pathname);
    await expect(page.getByRole("heading", { level: 1, name: "Your appointment" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel appointment" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(page.getByText("Your appointment is cancelled.")).toBeVisible();
    await axe(page, "manage-booking");
    await page.screenshot({ path: testInfo.outputPath("manage-cancelled.png"), fullPage: true });
    await page.reload();
    await expect(page.getByText("This appointment is cancelled.")).toBeVisible();
  });
});
