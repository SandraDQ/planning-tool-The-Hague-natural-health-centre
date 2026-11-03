import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DomainError } from "@/lib/domain/store";
import type { IntakeInput, Session } from "@/lib/domain/types";
import { DEMO_IDS, createSeedState } from "@/lib/server/demo/seed";
import { createDemoStore } from "@/lib/server/demo/store";
import { renderBookingConfirmation, sampleConfirmation } from "./booking-confirmation";
import { deliveryDecision, parseAddress, readEmailConfig } from "./config";
import { clearOutbox, listOutbox } from "./outbox";
import { sendBookingConfirmation, sendTherapistNewBooking } from "./notify";
import { manageToken, readManageToken } from "./manage-link";
import { sendEmail } from "./send";

const T0 = Date.parse("2026-11-02T07:30:00Z");
const DAY = 86_400_000;
const range = (from: number, days: number) => ({ start: new Date(from).toISOString(), end: new Date(from + days * DAY).toISOString() });
const guest = { firstName: "Mila", lastName: "Gast", email: "mila@example.invalid", phone: "+31 6 0000 0000", locale: "en" as const };
const intake: IntakeInput = { reason: "SECRET-INTAKE-REASON", newClient: true, acceptedPolicy: true, healthDataConsent: true };

function setup() {
  const state = createSeedState(new Date(T0));
  const store = createDemoStore(state, { now: () => T0 });
  return { state, store };
}

const therapistOf = (state: ReturnType<typeof createSeedState>, sessionTypeId: string): Session => {
  const st = state.sessionTypes.find((s) => s.id === sessionTypeId)!;
  const therapistId = state.services.find((s) => s.id === st.serviceId)!.therapistId;
  return { role: "therapist", userId: `user-${therapistId}`, therapistId, displayName: "T" };
};
const admin: Session = { role: "admin", userId: DEMO_IDS.admin, displayName: "Admin" };

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DomainError ? e.code : "other";
  }
}

describe("confirmation e-mail renderer", () => {
  it("puts date, time, therapist, money and the help phone number in, in the client's language", () => {
    const m = renderBookingConfirmation(sampleConfirmation("nl", { start: "2026-11-10T09:00:00Z", personalMessage: "Tot dan!" }));
    expect(m.subject).toContain("10 november");
    expect(m.subject).toContain("10:00"); // Amsterdam time (UTC+1)
    expect(m.html).toContain('lang="nl"');
    expect(m.html).toContain("Tot dan!");
    expect(m.html).toContain("+31 6 23 32 87 57");
    expect(m.text).toMatch(/Aanbetaling betaald: €\s25,00/);
    expect(m.text).toMatch(/Nog te betalen bij de afspraak: €\s60,00/);
    const en = renderBookingConfirmation(sampleConfirmation("en", { start: "2026-11-10T09:00:00Z" }));
    expect(en.subject).toBe("Your appointment on Tuesday 10 November at 10:00 is confirmed");
  });

  it("escapes what therapists and the admin type, so it can never inject HTML", () => {
    const m = renderBookingConfirmation(
      sampleConfirmation("en", { personalMessage: '<script>alert(1)</script>\n<a href="x">', centreInfo: "<img src=x onerror=alert(1)>", therapistName: "<b>Ira</b>" }),
    );
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).not.toContain("<b>Ira</b>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("e-mail config and delivery rules (demo safety)", () => {
  it("reads the provider only when a key is set; Brevo is the default", () => {
    expect(readEmailConfig({}).provider).toBeNull();
    expect(readEmailConfig({ EMAIL_API_KEY: "k" }).provider).toBe("brevo");
    expect(readEmailConfig({ EMAIL_API_KEY: "k", EMAIL_PROVIDER: "Resend" }).provider).toBe("resend");
    expect(readEmailConfig({ EMAIL_DEMO_RECIPIENTS: "A@x.nl, b@y.nl;junk" }).demoRecipients).toEqual(["a@x.nl", "b@y.nl"]);
    expect(parseAddress("THNHC <bookings@x.nl>")).toEqual({ name: "THNHC", email: "bookings@x.nl" });
  });

  it("in demo mode only sends to the allowed list; without a key never sends", () => {
    const cfg = readEmailConfig({ EMAIL_API_KEY: "k", EMAIL_DEMO_RECIPIENTS: "sandra@example.invalid" });
    expect(deliveryDecision(cfg, "Sandra@example.invalid", true)).toBe("send");
    expect(deliveryDecision(cfg, "stranger@example.invalid", true)).toBe("demo_recipient");
    expect(deliveryDecision(cfg, "stranger@example.invalid", false)).toBe("send");
    expect(deliveryDecision(readEmailConfig({}), "sandra@example.invalid", false)).toBe("no_provider");
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    clearOutbox();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_DEMO_RECIPIENTS", "sandra@example.invalid");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls Brevo for an allowed demo address and keeps others in the outbox", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const msg = { subject: "Hi", html: "<p>Hi</p>", text: "Hi", kind: "test", attachments: [{ filename: "f.pdf", contentType: "application/pdf", contentBase64: "JVBERg==" }] };
    expect(await sendEmail({ ...msg, to: "sandra@example.invalid" })).toEqual({ id: "m1", via: "brevo" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(String(init.body));
    expect(body.attachment).toEqual([{ name: "f.pdf", content: "JVBERg==" }]);
    expect((init.headers as Record<string, string>)["api-key"]).toBe("test-key");

    expect((await sendEmail({ ...msg, to: "stranger@example.invalid" })).via).toBe("outbox");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listOutbox().map((e) => e.heldBack)).toEqual(["demo_recipient", null]);
  });

  it("reports a provider error by status only, never the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key test-key", { status: 401 })));
    const err = await sendEmail({ to: "sandra@example.invalid", subject: "s", html: "h", text: "t", kind: "test" }).catch((e) => e);
    expect(err.code).toBe("brevo_http_401");
    expect(String(err.message)).not.toContain("test-key");
  });

  it("logs a therapist's invoice to a client without its subject or content (D31)", async () => {
    const msg = { subject: "Your deposit invoice", html: "<p>Invoice</p>", text: "Invoice", attachments: [{ filename: "2026-0001.pdf", contentType: "application/pdf", contentBase64: "JVBERg==" }] };
    await sendEmail({ ...msg, to: "client@example.invalid", kind: "client_invoice" });
    await sendEmail({ ...msg, to: "therapist@example.invalid", kind: "invoice" });
    const [rent, client] = listOutbox();
    expect(client).toMatchObject({ kind: "client_invoice", subject: "", html: null, attachmentNames: [] });
    expect(rent).toMatchObject({ kind: "invoice", subject: "Your deposit invoice", attachmentNames: ["2026-0001.pdf"] });
  });

  it("refuses header-like recipients", async () => {
    await expect(sendEmail({ to: "a@b.nl,c@d.nl", subject: "s", html: "h", text: "t", kind: "test" })).rejects.toThrow();
  });
});

describe("confirmation texts in the demo store", () => {
  beforeEach(() => {
    clearOutbox();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("EMAIL_API_KEY", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("a therapist edits only their own messages; the admin owns the centre info", async () => {
    const { state, store } = setup();
    const me = therapistOf(state, "st-daan-60");
    const mine = state.services.find((s) => s.therapistId === me.therapistId)!;
    const other = state.services.find((s) => s.therapistId !== me.therapistId)!;
    await store.email.setMyTemplate(me, { serviceId: null, body: { nl: " Hallo ", en: "Hello" } });
    await store.email.setMyTemplate(me, { serviceId: mine.id, body: { nl: "Eigen", en: "Own" } });
    expect(await store.email.listMyTemplates(me)).toHaveLength(2);
    expect((await store.email.listMyTemplates(me)).find((t) => t.serviceId === null)!.body.nl).toBe("Hallo");
    expect(await code(store.email.setMyTemplate(me, { serviceId: other.id, body: { nl: "x", en: "x" } }))).toBe("forbidden");
    expect(await code(store.email.setMyTemplate(me, { serviceId: null, body: { nl: "x".repeat(2001), en: "" } }))).toBe("invalid");
    expect(await code(store.email.setCentreSettings(me, { info: { nl: "x", en: "x" } }))).toBe("forbidden");
    expect(await code(store.email.listMyTemplates(admin))).toBe("forbidden");
    await store.email.setCentreSettings(admin, { info: { nl: "Bel aan", en: "Ring the bell" } });
    expect((await store.email.getCentreSettings(me)).info.en).toBe("Ring the bell");
  });

  it("sends one confirmation after payment, with the therapist's message for that treatment", async () => {
    const { state, store } = setup();
    const me = therapistOf(state, "st-daan-60");
    const st = state.sessionTypes.find((s) => s.id === "st-daan-60")!;
    await store.email.setMyTemplate(me, { serviceId: null, body: { nl: "Algemeen", en: "General words" } });
    await store.email.setMyTemplate(me, { serviceId: st.serviceId, body: { nl: "Speciaal", en: "Bring a towel" } });
    await store.email.setCentreSettings(admin, { info: { nl: "Bel aan", en: "Ring the bell" } });
    const slot = (await store.public.findSlots("st-daan-60", range(T0 + DAY, 14)))[0];
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });

    expect(await sendBookingConfirmation(store, held.id)).toBeNull(); // not paid yet
    await store.booking.confirmPayment(held.id, "tr_1");
    expect((await sendBookingConfirmation(store, held.id))?.via).toBe("outbox");
    expect(await sendBookingConfirmation(store, held.id)).toBeNull(); // webhook retry: no second e-mail

    const [mail] = listOutbox();
    expect(mail.to).toBe("mila@example.invalid");
    expect(mail.kind).toBe("booking_confirmation");
    expect(mail.html).toContain("Bring a towel");
    expect(mail.html).not.toContain("General words");
    expect(mail.html).toContain("Ring the bell");
    expect(mail.html).toContain("Dear Mila,");
    expect(mail.html).not.toContain("SECRET-INTAKE-REASON"); // intake never goes into the e-mail
  });
});

describe("cancel link and therapist e-mail", () => {
  beforeEach(() => {
    clearOutbox();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("EMAIL_API_KEY", undefined);
    vi.stubEnv("SITE_URL", "https://app.example.invalid");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function paidBooking() {
    const { state, store } = setup();
    const slot = (await store.public.findSlots("st-daan-60", range(T0 + DAY, 14)))[0];
    const held = await store.booking.holdSlot({ sessionTypeId: "st-daan-60", slot, client: guest, intake });
    await store.booking.confirmPayment(held.id, "tr_1");
    return { state, store, id: held.id };
  }

  it("the cancel link is signed: a changed id or signature is refused", () => {
    const token = manageToken("appt-1");
    expect(readManageToken(token)).toBe("appt-1");
    expect(readManageToken(token.replace("appt-1", "appt-2"))).toBeNull();
    expect(readManageToken(`${token}x`)).toBeNull();
    expect(readManageToken("appt-1")).toBeNull();
  });

  it("the confirmation carries a working cancel link; cancelling through it refunds in time", async () => {
    const { store, id } = await paidBooking();
    await sendBookingConfirmation(store, id);
    const html = listOutbox()[0].html!;
    const href = /href="(https:\/\/app\.example\.invalid\/en\/book\/manage\/[^"]+)"/.exec(html)?.[1];
    expect(href).toBeTruthy();
    const token = decodeURIComponent(href!.split("/").pop()!.replace(/&amp;/g, "&"));
    expect(readManageToken(token)).toBe(id);
    const result = await store.booking.cancelWithLink(id);
    expect(result.appointment.status).toBe("cancelled");
    expect(result.refundCents).toBe(result.depositPaidCents);
    expect(await code(store.booking.cancelWithLink(id))).toBe("invalid"); // already cancelled
  });

  it("the therapist gets a short new-booking e-mail without health information", async () => {
    const { state, store, id } = await paidBooking();
    expect((await sendTherapistNewBooking(store, id))?.via).toBe("outbox");
    expect(await sendTherapistNewBooking(store, id)).toBeNull();
    const mail = listOutbox()[0];
    const therapistId = state.appointments.find((a) => a.id === id)!.therapistId;
    expect(mail.to).toBe(state.therapistLoginEmails[therapistId]);
    expect(mail.subject).toContain("Mila");
    expect(mail.html).toContain("https://app.example.invalid/nl/therapist");
    expect(mail.html).not.toContain("SECRET-INTAKE-REASON");
    expect(mail.html).not.toContain("mila@example.invalid");
  });
});
