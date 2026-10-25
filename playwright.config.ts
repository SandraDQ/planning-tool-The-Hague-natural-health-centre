import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/*
 * E2E tests for the demo-mode MVP (QA agent, master prompt section 15).
 *
 * The demo data lives in the memory of one `next start` process, so tests run
 * one at a time (workers: 1) and each spec that changes data resets it first.
 *
 * Server:
 *   - E2E_BASE_URL=http://localhost:3300 pnpm test:e2e   → use a server you started yourself
 *   - pnpm test:e2e                                        → tests/e2e/serve-isolated.sh builds HEAD in a
 *     separate git worktree (so a build never touches the shared .next) and starts it on E2E_PORT (3300).
 *   Use "localhost", not 127.0.0.1: the locale redirect on "/" points at localhost, and the demo session
 *   cookie is Secure (Chromium accepts Secure cookies on localhost only).
 *
 * Browser: the preinstalled Chromium in /opt/pw-browsers (no `playwright install` needed).
 */
const port = Number(process.env.E2E_PORT ?? 3300);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const preinstalled = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled } : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "mobile",
      grepInvert: /@desktop/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, browserName: "chromium", launchOptions },
    },
    {
      name: "desktop",
      grepInvert: /@mobile/,
      use: { viewport: { width: 1280, height: 800 }, browserName: "chromium", launchOptions },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `bash tests/e2e/serve-isolated.sh ${port}`,
        url: `${baseURL}/en/login`,
        reuseExistingServer: true,
        timeout: 15 * 60_000,
        stdout: "pipe",
      },
});
