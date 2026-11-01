import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { amsDay, resetDemo, shot, signIn, watchErrors } from "./helpers";

/* Invoicing (master prompt 9.3, 9.4): therapist payments page, admin rent run, client invoices, PDF access. */

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
}

test.describe("invoices", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("therapist: welcome, record a payment, send an invoice", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Demo – Anna de Vries");
    await page.getByRole("link", { name: "Payments" }).first().click();
    await expect(page).toHaveURL(/\/en\/therapist\/invoices/);
    await expect(page.getByRole("heading", { name: "Welcome to your payments page" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "invoices-therapist", testInfo);
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("button", { name: "How does this page work?" })).toBeVisible();

    const rows = page.getByRole("button", { name: "Payment received" });
    const before = await rows.count();
    expect(before).toBeGreaterThan(1);
    await rows.first().click();
    const sheet = page.getByRole("dialog", { name: "Payment received" });
    await sheet.getByText("Cash").click();
    await sheet.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment saved")).toBeVisible();
    await expect(rows).toHaveCount(before - 1);

    await page.getByRole("button", { name: "Send invoice" }).first().click();
    const confirm = page.getByRole("dialog", { name: /^Send the invoice to/ });
    await confirm.getByRole("button", { name: "Yes, send invoice" }).click();
    await expect(page.getByText("Invoice sent", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Open invoice \d{4}-\d{4}/ }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("admin: prepare, check and send the rent invoices, then mark one paid @desktop", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Owner (admin)");
    await page.goto("/en/admin/invoices");
    await expect(page.getByRole("heading", { name: "Who still owes rent" })).toBeVisible();
    await page.getByRole("button", { name: "Prepare invoices" }).click();
    await expect(page.getByRole("heading", { name: "Check before sending" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "invoices-admin-drafts", testInfo);
    await page.getByRole("button", { name: /^Send \d+ invoices?$/ }).click();
    await page.getByRole("dialog", { name: "Send the rent invoices?" }).getByRole("button", { name: "Yes, send" }).click();
    await expect(page.getByRole("heading", { name: "Sent invoices" })).toBeVisible();

    const month = page.locator("section", { has: page.getByRole("heading", { name: /^Rent for/ }) });
    await month.getByRole("button", { name: "Mark as paid" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Mark as paid" });
    await expect(sheet.getByLabel("Date paid")).toHaveValue(amsDay());
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Marked as paid")).toBeVisible();
    await shot(page, "invoices-admin-sent", testInfo);

    // The PDF opens for the admin (room rent only).
    const href = await month.getByRole("link", { name: /^Open invoice/ }).first().getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(errors).toEqual([]);
  });

  test("client sees own invoices; nobody else can open them @desktop", async ({ page, browser }) => {
    await signIn(page, "Demo – Lotte Willems");
    await page.goto("/en/account");
    await expect(page.getByRole("heading", { name: "My invoices" })).toBeVisible();
    const link = page.getByRole("link", { name: /^Open invoice/ }).first();
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href"))!;
    expect((await page.request.get(href)).status()).toBe(200);

    for (const who of [null, "Owner (admin)", "Demo – Gijs Mulder"]) {
      const ctx = await browser.newContext();
      const other = await ctx.newPage();
      if (who) await signIn(other, who);
      expect((await other.request.get(href)).status(), `${who ?? "anonymous"} must not open a client invoice`).toBe(404);
      await ctx.close();
    }
  });
});
