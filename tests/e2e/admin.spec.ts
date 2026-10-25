import { expect, test } from "@playwright/test";
import { addDays, amsDay, mondayOf, resetDemo, shot, signIn, watchErrors } from "./helpers";

/* Admin portal on a desktop (master prompt 7, D12, D14). */

test.describe("admin @desktop", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, "Owner (admin)");
  });

  test("sign in as owner → overview and room grid", async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Good to see you");
    await shot(page, "admin-overview", testInfo);
    await page.getByRole("link", { name: "Room grid" }).first().click();
    await expect(page).toHaveURL(/\/en\/admin\/grid/);
    const grid = page.getByRole("table");
    await expect(grid).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6]) await expect(grid.getByRole("rowheader", { name: new RegExp(`^Room ${n}\\b`) })).toBeVisible();
    await expect(grid.getByRole("button", { name: /Demo – / }).first()).toBeVisible();
    await shot(page, "admin-grid", testInfo);
    expect(errors).toEqual([]);
  });

  test("assign a block to a therapist", async ({ page }, testInfo) => {
    const nextMonday = addDays(mondayOf(amsDay()), 7);
    await page.goto(`/en/admin/grid?week=${nextMonday}`);
    const free = page.getByRole("button", { name: /^Assign room 2, 08:00–12:00, Wednesday/ });
    const label = (await free.getAttribute("aria-label")) ?? (await free.innerText());
    await free.click();
    const sheet = page.getByRole("dialog", { name: /^Assign room 2/ });
    await expect(sheet.getByRole("button", { name: "Assign" })).toBeDisabled();
    await sheet.getByLabel("Therapist").selectOption({ label: "Demo – Eva Smit" });
    await shot(page, "admin-assign-sheet", testInfo);
    await sheet.getByRole("button", { name: "Assign" }).click();
    await expect(sheet).toBeHidden();
    // The cell now shows Eva's block instead of the free slot.
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    const cell = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^Room 2\b/ }) }).getByRole("cell").nth(2);
    await expect(cell.getByRole("button", { name: /08:00 .*Demo – Eva Smit/ })).toBeVisible();
    await shot(page, "admin-assigned", testInfo);
  });

  test("a reserved block with bookings can't be released from the grid (D14)", async ({ page }, testInfo) => {
    await page.goto("/en/admin/grid");
    await page.getByRole("button", { name: /Every week Demo – .* [1-9]\d* appointments?$/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/This block has \d+ bookings?/)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Release block" })).toBeDisabled();
    await shot(page, "admin-release-blocked", testInfo);
  });

  test("edit a room", async ({ page }, testInfo) => {
    await page.goto("/en/admin/rooms");
    await page.getByRole("button", { name: "Edit room 5" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit room 5" });
    await sheet.getByLabel(/^Name/).fill("Garden room");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Garden room" })).toBeVisible();
    await shot(page, "admin-room-edited", testInfo);
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Garden room" })).toBeVisible();
  });

  test("a private room with future bookings can't be made shared or reassigned", async ({ page }) => {
    await page.goto("/en/admin/rooms");
    await page.getByRole("button", { name: "Edit room 4" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit room 4" });
    await sheet.getByLabel("Type").selectOption({ label: "Shared" });
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/This block has bookings|Move or cancel/).first()).toBeVisible();
  });

  test("set a rent rate: fixed monthly vs per block", async ({ page }, testInfo) => {
    await page.goto("/en/admin/rent");
    // Room 1 (shared, default price) → its own per-block price.
    await page.getByRole("button", { name: "Change Room 1" }).click();
    let sheet = page.getByRole("dialog", { name: "Price for Room 1" });
    await expect(sheet.getByRole("radio", { name: /^Per block/ })).toBeChecked();
    await sheet.getByLabel("Amount per block (excl. VAT)").fill("45.00");
    await sheet.getByLabel("Starts on").fill(amsDay());
    await shot(page, "admin-rent-per-block", testInfo);
    await sheet.getByRole("button", { name: "Save price" }).click();
    await expect(page.getByText("Price saved")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Room 1" }).getByText(/€45\.00/)).toBeVisible();

    // Room 2 → fixed monthly.
    await page.getByRole("button", { name: "Change Room 2" }).click();
    sheet = page.getByRole("dialog", { name: "Price for Room 2" });
    await sheet.getByRole("radio", { name: /^Fixed monthly rent/ }).check({ force: true });
    await sheet.getByLabel("Amount per month (excl. VAT)").fill("500.00");
    await sheet.getByRole("combobox", { name: "VAT", exact: true }).selectOption({ label: "21% VAT" });
    await sheet.getByLabel("Starts on").fill(amsDay());
    await sheet.getByRole("button", { name: "Save price" }).click();
    await expect(page.getByText("Price saved")).toBeVisible();
    const room2 = page.getByRole("listitem").filter({ hasText: "Room 2" });
    await expect(room2.getByText(/€500\.00/)).toBeVisible();
    await expect(room2.getByText(/per month/)).toBeVisible();
    await shot(page, "admin-rent-saved", testInfo);
  });

  test("edit a renter's business details (with KvK / btw-id checks)", async ({ page }, testInfo) => {
    await page.goto("/en/admin/renters");
    await page.getByRole("link", { name: /Demo – Eva Smit/ }).click();
    await expect(page).toHaveURL(/\/en\/admin\/renters\/th-eva/);
    await page.getByLabel("Legal name").fill("E. Smit Ayurveda");
    await page.getByLabel("Trade name").fill("Eva Ayurveda");
    await page.getByLabel("Business address").fill("Badhuisstraat 224, 2584 HN Den Haag");
    await page.getByLabel(/KvK number/).fill("1234");
    await page.getByLabel(/VAT number/).fill("NL12");
    await page.getByRole("button", { name: "Save business details" }).click();
    await expect(page.getByText("A KvK number has 8 digits.")).toBeVisible();
    await expect(page.getByText("Use the format NL123456789B01.")).toBeVisible();
    await page.getByLabel(/KvK number/).fill("12345678");
    await page.getByLabel(/VAT number/).fill("NL123456789B01");
    await page.getByRole("button", { name: "Save business details" }).click();
    await expect(page.getByText("Business details saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Legal name")).toHaveValue("E. Smit Ayurveda");
    await expect(page.getByLabel(/KvK number/)).toHaveValue("12345678");
    await shot(page, "admin-renter-business", testInfo);
  });
});
