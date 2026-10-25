// Privacy & security review of the MVP application layer (handoffs/reviews/mvp-app-review.md).
// Tests named "HOLE:" pass WHILE the hole exists. Turn each one around when its fix lands (then "FIXED:").
// Tests named "OK:" check a property that holds today and must keep holding.

import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { IntakeInput, Session } from "@/lib/domain/types";
import { DEMO_IDS, createSeedState } from "../demo/seed";
import { createDemoStore } from "../demo/store";
import { stableId } from "../demo/ids";
import { assertSafeMode, hasRealBackend, isDemoMode } from "../mode";
import { createSessionToken, sessionSecret, signValue, verifySessionToken } from "../session-token";

// ownership.ts is server-only and reads cookies(); stub both so the real check runs here.
let bookingsCookie = "";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "thnhc_bookings" ? { value: bookingsCookie } : undefined) }),
}));
vi.mock("@/lib/server/session", () => ({ getSession: async () => null }));
// The booking actions redirect through next-intl; stand in for Next's redirect (it throws).
vi.mock("@/i18n/navigation", () => ({
  redirect: (to: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const T0 = Date.parse("2026-11-02T07:30:00Z"); // Monday morning, Amsterdam
const DAY = 86_400_000;

function setup() {
  const clock = { now: T0 };
  const state = createSeedState(new Date(T0));
  const store = createDemoStore(state, { now: () => clock.now });
  return { clock, state, store };
}

const as = {
  admin: { role: "admin", userId: DEMO_IDS.admin, displayName: "Admin" } satisfies Session,
  therapist: (therapistId: string): Session => ({ role: "therapist", userId: `user-${therapistId}`, therapistId, displayName: therapistId }),
  lotte: { role: "client", userId: "user-client-lotte", clientId: DEMO_IDS.clientLotte, displayName: "Lotte" } satisfies Session,
};
const intake = (reason: string): IntakeInput => ({ reason, newClient: true, acceptedPolicy: true, healthDataConsent: true });
const range = (from: number, days: number) => ({ start: new Date(from).toISOString(), end: new Date(from + days * DAY).toISOString() });

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
}

describe("A1 · online booking attaches to an existing client by e-mail (F2, D26)", () => {
  it("FIXED: a stranger who types Lotte's e-mail gets a new guest record; Lotte's account and name stay untouched", async () => {
    const { state, store } = setup();
    const lotte = state.clients.find((c) => c.id === DEMO_IDS.clientLotte)!;
    const slot = (await store.public.findSlots("st-daan-60", range(T0 + 2 * DAY, 14)))[0];
    const appt = await store.booking.holdSlot({
      sessionTypeId: "st-daan-60",
      slot,
      client: { firstName: "Mallory", lastName: "Stranger", email: lotte.email.toUpperCase(), phone: "+31 6 9999 9999", locale: "en" },
      intake: intake("INJECTED-BY-STRANGER"),
    });
    expect(appt.clientId).not.toBe(lotte.id);
    expect((await store.client.listMyAppointments(as.lotte)).some((a) => a.id === appt.id)).toBe(false);
    const [client] = await store.therapist.listClients(as.therapist("th-daan"), [appt.clientId]);
    expect(client.firstName).toBe("Mallory");
    expect(state.clients.find((c) => c.id === lotte.id)).toEqual(lotte);
  });

  it("FIXED: a signed-in client always books as themselves, whatever e-mail is typed", async () => {
    const { store } = setup();
    const slot = (await store.public.findSlots("st-daan-60", range(T0 + 2 * DAY, 14)))[0];
    const appt = await store.booking.holdSlot({
      sessionTypeId: "st-daan-60",
      slot,
      client: { firstName: "X", lastName: "Y", email: "someone.else@example.invalid", phone: "+31 6 0", locale: "nl" },
      intake: intake("mine"),
      session: as.lotte,
    });
    expect(appt.clientId).toBe(DEMO_IDS.clientLotte);
  });
});

describe("A2 · the booking-ownership cookie (F1)", () => {
  afterEach(() => {
    bookingsCookie = "";
    vi.unstubAllEnvs();
  });

  it("FIXED: a hand-typed (even correctly guessed) id in thnhc_bookings no longer passes ownsBooking; only a server-signed entry does", async () => {
    const { ownsBooking } = await import("@/features/booking/server/ownership");
    const { state } = setup();
    const upcoming = state.appointments.find((a) => a.clientId === DEMO_IDS.clientLotte && a.status === "confirmed")!;
    const guessed = stableId(`appointment:${upcoming.therapistId}:${upcoming.roomId}:${upcoming.session.start}`);
    expect(guessed).toBe(upcoming.id); // seeded ids are still computable, so the cookie must not trust bare ids
    bookingsCookie = guessed;
    expect(await ownsBooking(upcoming)).toBe(false);
    bookingsCookie = signValue("booking", upcoming.id, "z".repeat(40)); // signed with another secret
    expect(await ownsBooking(upcoming)).toBe(false);
    bookingsCookie = `${upcoming.id}.${signValue("session", upcoming.id).split(".").pop()}`; // signature for another purpose
    expect(await ownsBooking(upcoming)).toBe(false);
    bookingsCookie = ["junk", signValue("booking", upcoming.id)].join(",");
    expect(await ownsBooking(upcoming)).toBe(true);
  });

  it("FIXED: the demo payment actions refuse to fail (release) a hold the caller cannot prove is theirs", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const { getStore } = await import("@/lib/server/data");
    const { demoPayFailed } = await import("@/features/booking/server/actions");
    const store = getStore();
    const slot = (await store.public.findSlots("st-daan-60", range(Date.now() + 2 * DAY, 14)))[0];
    const hold = await store.booking.holdSlot({
      sessionTypeId: "st-daan-60",
      slot,
      client: { firstName: "Real", lastName: "Client", email: "real.client@example.invalid", phone: "+31 6 1111 1111", locale: "nl" },
      intake: intake("x"),
    });
    const form = new FormData();
    form.set("locale", "nl");
    form.set("id", hold.id);
    bookingsCookie = hold.id; // unsigned: forged
    await expect(demoPayFailed(form)).rejects.toThrow(); // redirect away
    expect((await store.booking.getAppointment(hold.id))?.status).toBe("held");
    bookingsCookie = signValue("booking", hold.id);
    await expect(demoPayFailed(form)).rejects.toThrow(); // redirect back to the pay page
    expect((await store.booking.getAppointment(hold.id))?.status).toBe("cancelled");
  });
});

describe("A3 · no limit on anonymous holds", () => {
  it("HOLE: one anonymous caller can hold every free start of a therapist for two weeks (each hold blocks the slot for 15 min, renewable)", async () => {
    const { store } = setup();
    const day = range(T0 + 2 * DAY, 14);
    let held = 0;
    for (let i = 0; i < 40; i++) {
      const slots = await store.public.findSlots("st-daan-60", day);
      if (slots.length === 0) break;
      await store.booking.holdSlot({
        sessionTypeId: "st-daan-60",
        slot: slots[0],
        client: { firstName: "Bot", lastName: `${i}`, email: `bot${i}@example.invalid`, phone: "+31 6 0000 0000", locale: "nl" },
        intake: intake("spam"),
      });
      held++;
    }
    // Nothing stopped it: every online slot of this therapist for two weeks is now held by one caller.
    expect(held).toBeGreaterThan(5);
    expect(await store.public.findSlots("st-daan-60", day)).toHaveLength(0);
  });
});

describe("A4 · demo mode switch (F3, D28)", () => {
  const KEYS = [
    "DEMO_MODE",
    "DEMO_SESSION_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "DATABASE_URL",
    "MOLLIE_API_KEY",
    "MONEYBIRD_TOKEN",
    "EMAIL_API_KEY",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_SECRET",
  ];
  const clean = () => {
    for (const k of KEYS) vi.stubEnv(k, undefined);
  };
  afterEach(() => vi.unstubAllEnvs());

  it("FIXED: demo mode is off unless DEMO_MODE=1 is set explicitly", () => {
    clean();
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("DEMO_MODE", "1");
    expect(isDemoMode()).toBe(true);
    expect(() => assertSafeMode()).not.toThrow();
  });

  it("FIXED: DEMO_MODE=1 next to real payment, e-mail or database keys stays off and refuses to start", () => {
    for (const key of ["DATABASE_URL", "MOLLIE_API_KEY", "EMAIL_API_KEY", "MONEYBIRD_TOKEN", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "GOOGLE_CLIENT_SECRET"]) {
      clean();
      vi.stubEnv("DEMO_MODE", "1");
      vi.stubEnv(key, "real-value");
      expect(isDemoMode(), key).toBe(false);
      expect(() => assertSafeMode(), key).toThrow(key);
      expect(() => assertSafeMode(), key).not.toThrow("real-value"); // names only, never values
    }
  });

  it("FIXED: SUPABASE_URL alone (service key forgotten) keeps demo mode off", () => {
    clean();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    expect(hasRealBackend()).toBe(false);
    expect(isDemoMode()).toBe(false);
  });

  it("FIXED: a production demo needs DEMO_SESSION_SECRET of 32+ characters", () => {
    clean();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    expect(() => assertSafeMode()).toThrow("DEMO_SESSION_SECRET");
    vi.stubEnv("DEMO_SESSION_SECRET", "short");
    expect(() => assertSafeMode()).toThrow("DEMO_SESSION_SECRET");
    vi.stubEnv("DEMO_SESSION_SECRET", "s".repeat(32));
    expect(() => assertSafeMode()).not.toThrow();
  });

  it("OK: both Supabase keys switch demo mode off", () => {
    clean();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
    expect(hasRealBackend()).toBe(true);
    expect(isDemoMode()).toBe(false);
  });
});

describe("A5 · demo session token", () => {
  const saved = process.env.DEMO_SESSION_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.DEMO_SESSION_SECRET;
    else process.env.DEMO_SESSION_SECRET = saved;
  });

  it("OK: tokens signed with an empty or short secret are refused; a short env secret is ignored (random per process)", () => {
    process.env.DEMO_SESSION_SECRET = "short";
    const secret = sessionSecret();
    expect(secret).not.toBe("short");
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(verifySessionToken(createSessionToken("admin", ""), secret)).toBeNull();
    expect(verifySessionToken(createSessionToken("admin", "short"), secret)).toBeNull();
    const ok = createSessionToken("admin", secret);
    expect(verifySessionToken(ok, secret)).toBe("admin");
    // No "alg"/payload games: a payload with an extra segment or a non-string account is refused.
    expect(verifySessionToken(`${ok}.x`, secret)).toBeNull();
  });
});

describe("A6 · data minimisation for admin and therapists (holds today)", () => {
  it("OK: admin room grid carries first names only: no last name, e-mail, phone or intake", async () => {
    const { state, store } = setup();
    const grid = await store.admin.roomGrid(as.admin, range(T0 - 7 * DAY, 35));
    const json = JSON.stringify(grid);
    expect(grid.appointments.length).toBeGreaterThan(0);
    for (const c of state.clients) {
      expect(json).not.toContain(c.email);
      if (c.phone) expect(json).not.toContain(c.phone);
    }
    for (const i of state.intakes) expect(json).not.toContain(i.answers.reason);
    expect(Object.keys(grid.appointments[0]).sort()).not.toContain("lastName");
  });

  it("OK: IDORs on ids passed from forms are refused by the store", async () => {
    const { state, store } = setup();
    const anna = state.appointments.find((a) => a.therapistId === "th-anna" && a.status === "confirmed" && Date.parse(a.session.start) > T0)!;
    const bram = as.therapist("th-bram");
    expect(await code(store.therapist.readIntake(bram, anna.id))).toBe("forbidden");
    expect(await code(store.therapist.cancelAppointment(bram, anna.id, "therapist"))).toBe("forbidden");
    expect(await code(store.therapist.recordBalancePayment(bram, { appointmentId: anna.id, method: "cash", amountCents: 100, paidOn: "2026-11-02" }))).toBe("forbidden");
    const annaService = state.services.find((s) => s.therapistId === "th-anna")!;
    expect(await code(store.therapist.upsertService(bram, { ...annaService }))).not.toBe("ok");
    const annaBlock = state.blocks.find((b) => b.therapistId !== "th-bram" && b.status === "reserved");
    if (annaBlock) expect(await code(store.therapist.releaseBlock(bram, annaBlock.id))).toBe("forbidden");
    expect(await code(store.client.cancelAppointment(as.lotte, anna.id, "client"))).toBe("forbidden");
    expect(await code(store.admin.listRooms(bram))).toBe("forbidden");
    expect(await code(store.therapist.getMe(as.admin))).toBe("forbidden");
  });
});

describe("A7 · input validation details", () => {
  it("FIXED (F9): photoUrl accepts same-origin paths only", async () => {
    const { store } = setup();
    for (const bad of ["//tracker.example/pixel.gif", "/\\tracker.example/x", "https://tracker.example/x.gif", "javascript:alert(1)", "/a b"]) {
      expect(await code(store.therapist.updateMe(as.therapist("th-anna"), { photoUrl: bad })), bad).toBe("invalid");
    }
    expect((await store.therapist.updateMe(as.therapist("th-anna"), { photoUrl: "/media/anna.jpg" })).photoUrl).toBe("/media/anna.jpg");
  });

  it("FIXED (F10): setBusiness stores only the known fields (no mass assignment)", async () => {
    const { state, store } = setup();
    await store.admin.setBusiness(as.admin, {
      therapistId: "th-anna",
      legalName: "Anna BV",
      tradeName: null,
      address: null,
      kvk: null,
      btwNumber: null,
      kor: false,
      ...({ iban: "NL00EVIL0000000000", isAdmin: true } as object),
    });
    const row = state.business.find((b) => b.therapistId === "th-anna")!;
    expect(row).not.toHaveProperty("isAdmin");
    expect(row).not.toHaveProperty("iban");
    expect(row.legalName).toBe("Anna BV");
  });
});
