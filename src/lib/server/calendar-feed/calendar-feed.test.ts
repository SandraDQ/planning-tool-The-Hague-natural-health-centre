import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsText } from "./ics";
import { createFeedToken, feedKey, readFeedToken } from "./token";
import { createSeedState } from "../demo/seed";
import { createDemoStore } from "../demo/store";
import type { Session } from "@/lib/domain/types";

const SECRET = "test-secret-test-secret-test-secret-00";

describe("ics", () => {
  it("formats UTC dates and escapes text", () => {
    expect(icsDate("2026-11-02T08:30:00.000Z")).toBe("20261102T083000Z");
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "SUMMARY:" + "é".repeat(60);
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("builds a calendar with CRLF lines and stable UIDs", () => {
    const ics = buildIcs([{ uid: "appointment-1", start: "2026-11-02T08:00:00Z", end: "2026-11-02T09:00:00Z", title: "Anna — Acupuncture" }], {
      calendarName: "THNHC",
      nowIso: "2026-11-01T12:00:00Z",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:appointment-1@thehague-naturalhealthcentre.com");
    expect(ics).toContain("DTSTART:20261102T080000Z");
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});

describe("feed token", () => {
  it("round-trips therapist and admin subjects", () => {
    expect(readFeedToken(createFeedToken({ kind: "therapist", id: "th-anna" }, 2, SECRET), SECRET)).toEqual({
      subject: { kind: "therapist", id: "th-anna" },
      version: 2,
    });
    expect(readFeedToken(createFeedToken({ kind: "admin" }, 0, SECRET), SECRET)).toEqual({ subject: { kind: "admin" }, version: 0 });
  });

  it("rejects forged, tampered or foreign-secret tokens", () => {
    const token = createFeedToken({ kind: "therapist", id: "th-anna" }, 0, SECRET);
    const [data, sig] = token.split(".");
    const otherData = Buffer.from(JSON.stringify({ k: "t", id: "th-bram", v: 0 })).toString("base64url");
    expect(readFeedToken(`${otherData}.${sig}`, SECRET)).toBeNull();
    expect(readFeedToken(`${data}.${sig}x`, SECRET)).toBeNull();
    expect(readFeedToken(token, "another-secret-another-secret-000000")).toBeNull();
    expect(readFeedToken("", SECRET)).toBeNull();
    expect(readFeedToken(`${data}.${sig}.extra`, SECRET)).toBeNull();
  });

  it("is not interchangeable with a demo session token", () => {
    // Same HMAC key, but the feed signs a prefixed string, so a session signature never verifies here.
    const data = Buffer.from(JSON.stringify({ k: "a", v: 0 })).toString("base64url");
    const sessionStyle = createHmac("sha256", SECRET).update(data).digest("base64url");
    expect(readFeedToken(`${data}.${sessionStyle}`, SECRET)).toBeNull();
  });
});

describe("demo feeds", () => {
  const T0 = Date.parse("2026-11-02T07:30:00Z");
  const range = { start: "2026-10-01T00:00:00Z", end: "2027-02-01T00:00:00Z" };
  const anna: Session = { role: "therapist", userId: "u-anna", therapistId: "th-anna", displayName: "Demo – Anna de Vries" };
  const admin: Session = { role: "admin", userId: "u-admin", displayName: "Demo – Owner" };
  const client: Session = { role: "client", userId: "u-lotte", clientId: "client-lotte", displayName: "Lotte" };
  const setup = () => {
    const state = createSeedState(new Date(T0));
    return { state, store: createDemoStore(state, { now: () => T0 }) };
  };

  it("therapist feed shows own appointments with first name and service only", async () => {
    const { state, store } = setup();
    const events = await store.feeds.events({ kind: "therapist", id: "th-anna" }, range, "en");
    const appts = events.filter((e) => e.uid.startsWith("appointment-"));
    expect(appts.length).toBeGreaterThan(0);
    const own = new Set(state.appointments.filter((a) => a.therapistId === "th-anna").map((a) => `appointment-${a.id}`));
    for (const e of appts) expect(own.has(e.uid)).toBe(true);
    const text = JSON.stringify(events);
    for (const i of state.intakes) expect(text).not.toContain(i.answers.reason);
    for (const c of state.clients) {
      if (c.email) expect(text).not.toContain(c.email);
      if (c.lastName) expect(text).not.toContain(` ${c.lastName}`);
    }
  });

  it("admin feed shows room blocks without client details", async () => {
    const { state, store } = setup();
    const events = await store.feeds.events({ kind: "admin" }, range, "nl");
    expect(events.some((e) => e.uid.startsWith("block-"))).toBe(true);
    expect(events.some((e) => e.uid.startsWith("appointment-"))).toBe(false);
    const text = JSON.stringify(events);
    for (const c of state.clients) expect(text).not.toContain(c.email);
  });

  it("each viewer gets their own feed; reset bumps the version; clients have none", async () => {
    const { store } = setup();
    expect(await store.feeds.mine(anna)).toEqual({ subject: { kind: "therapist", id: "th-anna" }, version: 0 });
    expect(await store.feeds.mine(admin)).toEqual({ subject: { kind: "admin" }, version: 0 });
    await expect(store.feeds.mine(client)).rejects.toMatchObject({ code: "forbidden" });
    expect(await store.feeds.resetMine(anna)).toBe(1);
    expect(await store.feeds.versionFor({ kind: "therapist", id: "th-anna" })).toBe(1);
    expect(await store.feeds.versionFor({ kind: "admin" })).toBe(0);
    expect(feedKey({ kind: "therapist", id: "th-anna" })).toBe("therapist:th-anna");
  });
});
