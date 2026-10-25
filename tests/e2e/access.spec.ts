import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, amsDay, holdFirstSlot, mondayOf, nextWeekdayAfterToday, resetDemo, signIn } from "./helpers";

/* Access & privacy (master prompt 15): roles, signed-out redirects, and one therapist reaching another's appointment. */

async function expectLoginWall(page: Page, path: string) {
  await page.goto(path);
  await expect(page, `${path} should send the visitor to the login page`).toHaveURL(/\/(nl|en)\/login/);
}

/** A guest books Bram's massage and pays; returns the appointment id (it is in the URL). */
async function bookAsGuest(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await holdFirstSlot(page, "st-bram-60");
  await page.getByRole("button", { name: "Pay with iDEAL (demo)" }).click();
  await expect(page).toHaveURL(/\/book\/confirmed\//);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  return { ctx, page, id };
}

test.describe("access", () => {
  test.beforeAll(async ({ browser }) => {
    await resetDemo(browser);
  });

  test("signed-out visitor is redirected to login", async ({ page }) => {
    for (const path of ["/en/admin", "/en/admin/grid", "/en/admin/renters/th-anna", "/en/therapist", "/en/therapist/blocks", "/nl/therapist/settings", "/en/account"]) {
      await expectLoginWall(page, path);
    }
  });

  test("therapist can't open /admin", async ({ page }) => {
    await signIn(page, "Demo – Anna de Vries");
    for (const path of ["/en/admin", "/en/admin/rooms", "/en/admin/rent", "/en/admin/renters/th-bram"]) {
      await page.goto(path);
      await expect(page, path).not.toHaveURL(/\/admin/);
      await expect(page.getByText("Business and tax details")).toHaveCount(0);
    }
  });

  test("client can't open /therapist or /admin", async ({ page }) => {
    await signIn(page, "Demo – Lotte Willems");
    for (const path of ["/en/therapist", "/en/therapist/blocks", "/en/admin"]) {
      await page.goto(path);
      await expect(page, path).not.toHaveURL(/\/(therapist|admin)/);
    }
  });

  test("a booking's pay/confirmation pages can't be opened by others", async ({ browser }) => {
    const { ctx, id } = await bookAsGuest(browser);
    // Another therapist, another client, and an anonymous visitor.
    for (const who of ["Demo – Anna de Vries", "Demo – Lotte Willems", null]) {
      const c = await browser.newContext();
      const p = await c.newPage();
      if (who) await signIn(p, who);
      for (const path of [`/en/book/confirmed/${id}`, `/en/book/pay/${id}`]) {
        const res = await p.goto(path);
        const status = res?.status() ?? 0;
        const leaked = await p.getByText(/Your appointment is booked|Pay your deposit/).count();
        expect(leaked, `${who ?? "anonymous"} sees ${path} (HTTP ${status})`).toBe(0);
      }
      await c.close();
    }
    await ctx.close();
  });

  test("therapist B can't cancel therapist A's appointment by swapping the id in the request", async ({ browser, page }) => {
    // A = Bram: a guest books with him.
    const guest = await bookAsGuest(browser);
    const bramAppointment = guest.id;

    // B = Anna: open one of her own future appointments and press Cancel, but rewrite the server action to target Bram's id.
    await signIn(page, "Demo – Anna de Vries");
    const day = nextWeekdayAfterToday([1, 2, 4], 3);
    await page.goto(`/en/therapist?week=${mondayOf(day)}&day=${day}`);
    let rewritten = "";
    await page.route("**/*", async (route) => {
      const req = route.request();
      const body = req.postData();
      if (req.method() === "POST" && req.headers()["next-action"] && body && /[0-9a-f-]{36}/.test(body)) {
        rewritten = body.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, bramAppointment);
        await route.continue({ postData: rewritten });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: /^\d\d:\d\d / }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel appointment" }).click();
    await page.waitForTimeout(2000);
    expect(rewritten, "the cancel request carried an appointment id we could swap").toContain(bramAppointment);
    await expect(page.getByText("Appointment cancelled")).toHaveCount(0);

    // Bram's appointment must still be confirmed: the guest's confirmation page still shows.
    await guest.page.reload();
    await expect(guest.page.getByRole("heading", { name: "Your appointment is booked" })).toBeVisible();
    await guest.ctx.close();
  });

  test("admin can't read intake: room grid shows no client names or complaints", async ({ page }) => {
    await signIn(page, "Owner (admin)");
    await page.goto(`/en/admin/grid?week=${addDays(mondayOf(amsDay()), 0)}`);
    await page.getByRole("button", { name: /Every week Demo – .* [1-9]\d* appointments?$/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Appointments in this block")).toBeVisible();
    await expect(sheet.getByText(/@example\.invalid|QA: general relaxation|complaint/i)).toHaveCount(0);
  });
});
