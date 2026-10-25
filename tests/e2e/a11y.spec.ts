import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fillDetails, resetDemo } from "./helpers";

/*
 * Accessibility smoke test (axe-core, WCAG 2.0/2.1 A + AA rules). Fails on serious or critical violations.
 * A summary per page goes to test-results/a11y/<project>-<page>.json for the QA handoff.
 */
type Finding = { page: string; id: string; impact: string; help: string; nodes: number; targets: string[]; detail: string[] };

async function scan(page: Page, name: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const findings: Finding[] = bad.map((v) => ({
    page: name,
    id: v.id,
    impact: v.impact!,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 8).map((n) => n.target.join(" ")),
    detail: v.nodes.slice(0, 8).map((n) => n.failureSummary ?? ""),
  }));
  mkdirSync("test-results/a11y", { recursive: true });
  writeFileSync(`test-results/a11y/${testInfo.project.name}-${name}.json`, JSON.stringify(findings, null, 2));
  await testInfo.attach(`axe-${name}`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
  expect.soft(bad.map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) — ${v.help}`), `axe on ${name}`).toEqual([]);
}

test.describe("accessibility", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  for (const locale of ["en", "nl"] as const) {
    test(`home and login (${locale})`, async ({ page }, testInfo) => {
      await page.goto(`/${locale}`);
      await scan(page, `${locale}-home`, testInfo);
      await page.goto(`/${locale}/login`);
      await scan(page, `${locale}-login`, testInfo);
    });
  }

  test("booking steps (en)", async ({ page }, testInfo) => {
    await page.goto("/en/book");
    await scan(page, "book-1-choose", testInfo);
    await page.goto("/en/book/time?st=st-bram-60");
    await scan(page, "book-2-time", testInfo);
    await page.getByRole("button", { name: /^\d\d:\d\d$/ }).first().click();
    await page.getByRole("link", { name: "Continue" }).last().click();
    await page.waitForURL(/details/);
    await scan(page, "book-3-details", testInfo);
    // Error state of the form.
    await page.getByRole("button", { name: "Continue to deposit" }).click();
    await expect(page.getByText("Please check the fields marked below.")).toBeVisible();
    await scan(page, "book-3-details-errors", testInfo);
    await fillDetails(page, { first: "Axe", last: "Check", email: "axe@example.invalid", phone: "0612345678" });
    await page.locator('input[name="acceptedPolicy"]').check();
    await page.locator('input[name="healthDataConsent"]').check();
    await page.getByRole("button", { name: "Continue to deposit" }).click();
    await page.waitForURL(/\/book\/pay\//);
    await scan(page, "book-4-pay", testInfo);
    await page.getByRole("button", { name: "Pay with iDEAL (demo)" }).click();
    await page.waitForURL(/\/book\/confirmed\//);
    await scan(page, "book-5-confirmed", testInfo);
  });
});
