import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resetDemo, shot, signIn, watchErrors } from "./helpers";

/* Bookkeeping (D40–D47): costs with receipts, bank payments with suggestions, BTW quarter and export. */

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
}

// A 1×1 PNG: enough to be recognised as a photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe("bookkeeping", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("admin: add a cost with a receipt, sort out bank payments, download the quarter @desktop", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Owner (admin)");
    await page.goto("/en/admin/books");
    await expect(page.getByRole("heading", { name: "Welcome to your bookkeeping" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "books-admin", testInfo);

    await page.getByRole("button", { name: "Add a cost" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Add a cost" });
    await sheet.getByTestId("receipt-input").setInputFiles({ name: "hema.png", mimeType: "image/png", buffer: PNG });
    await expect(sheet.getByText("Receipt added: hema.png")).toBeVisible();
    await sheet.getByLabel("Where did you buy it?").fill("HEMA");
    await sheet.getByLabel("Amount you paid (incl. BTW)").fill("12,10");
    await expect(sheet.getByText("Of this, €2.10 is BTW.")).toBeVisible();
    await sheet.getByRole("button", { name: "Save cost" }).click();
    await expect(page.getByText("Cost saved")).toBeVisible();
    const receipt = page.getByRole("link", { name: "Open the receipt of HEMA" });
    await expect(receipt).toBeVisible();
    const file = await page.request.get((await receipt.getAttribute("href"))!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");

    // Bank: a payment with no cost yet, and Bram's rent coming in.
    await page.getByRole("link", { name: "Look at them" }).click();
    await expect(page.getByRole("heading", { name: "Bank payments", level: 1 })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "books-admin-bank", testInfo);
    const bol = page.locator("li", { hasText: "bol.com" });
    await bol.getByRole("button", { name: "Add as a cost" }).click();
    const fromBank = page.getByRole("dialog", { name: "Add this payment as a cost" });
    await expect(fromBank.getByLabel("Amount you paid (incl. BTW)")).toHaveValue("64.99");
    await fromBank.getByRole("button", { name: "Save cost" }).click();
    await expect(page.locator("li", { hasText: "bol.com" }).getByText("Cost: bol.com")).toBeVisible();

    const rent = page.locator("li", { hasText: /looks like the payment of invoice/ }).first();
    await rent.getByRole("button", { name: "Yes, that's right" }).click();
    await expect(page.getByText("Payment sorted out")).toBeVisible();

    const workshop = page.locator("li", { hasText: "P. de Wit" });
    await workshop.getByRole("button", { name: "Choose what it is" }).click();
    const choose = page.getByRole("dialog", { name: "What is this payment?" });
    await choose.getByText("Other income", { exact: true }).click();
    await choose.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("li", { hasText: "P. de Wit" }).getByText("Other income")).toBeVisible();
    await page.locator("li", { hasText: "P. de Wit" }).getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone. The payment is back under “Needs a look”.")).toBeVisible();

    // BTW quarter and the download.
    await page.goto("/en/admin/books/btw");
    await expect(page.getByRole("heading", { name: "For your accountant to check" }).or(page.getByText("For your accountant to check"))).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "books-admin-btw", testInfo);
    const csvHref = await page.getByRole("link", { name: "Download spreadsheet only" }).getAttribute("href");
    const csv = await page.request.get(csvHref!);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("HEMA");
    const zip = await page.request.get((await page.getByRole("link", { name: "Download everything (zip)" }).getAttribute("href"))!);
    expect(zip.status()).toBe(200);
    expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
    expect(errors).toEqual([]);
  });

  test("therapist with the add-on sees her own books and BTW", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, "Demo – Anna de Vries");
    await page.getByRole("link", { name: "Bookkeeping" }).first().click();
    await expect(page).toHaveURL(/\/en\/therapist\/books/);
    await expect(page.getByRole("heading", { name: "Welcome to your bookkeeping" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await shot(page, "books-therapist", testInfo);
    await page.goto("/en/therapist/books/btw");
    await expect(page.getByRole("rowheader", { name: "Income with 21% BTW (box 1a)" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "BTW on your costs (box 5b)" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("therapist without the add-on can ask for it; nobody else sees the centre's books @desktop", async ({ page, browser }) => {
    await signIn(page, "Owner (admin)");
    await page.goto("/en/admin/books");
    const href = (await page.getByRole("link", { name: /^Open the receipt of/ }).first().getAttribute("href"))!;

    const ctx = await browser.newContext();
    const gijs = await ctx.newPage();
    await signIn(gijs, "Demo – Gijs Mulder");
    await gijs.goto("/en/therapist/books");
    await expect(gijs.getByRole("heading", { name: "Do your own bookkeeping here" })).toBeVisible();
    await gijs.getByRole("button", { name: "Ask the centre to switch it on" }).click();
    await expect(gijs.getByRole("heading", { name: "Your request has been sent" })).toBeVisible();
    expect((await gijs.request.get(href)).status()).toBe(404);
    expect((await gijs.request.get("/api/books/export?quarter=2026-Q4&format=csv")).status()).toBe(404);
    await ctx.close();

    const anon = await browser.newContext();
    expect((await (await anon.newPage()).request.get(href)).status()).toBe(404);
    await anon.close();
  });
});
