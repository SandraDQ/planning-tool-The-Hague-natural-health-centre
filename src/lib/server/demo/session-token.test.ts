import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "../session-token";

const SECRET = "x".repeat(40);
const NOW = Date.parse("2026-11-02T10:00:00Z");

describe("demo session token", () => {
  it("round-trips the account id", () => {
    expect(verifySessionToken(createSessionToken("admin", SECRET, NOW), SECRET, NOW)).toBe("admin");
  });

  it("rejects tampered, foreign and expired tokens", () => {
    const token = createSessionToken("client:client-lotte", SECRET, NOW);
    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, a: "admin", iat: Math.floor(NOW / 1000) })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${data}.${sig}x`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(token, "y".repeat(40), NOW)).toBeNull();
    expect(verifySessionToken(token, SECRET, NOW + (SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
    expect(verifySessionToken(undefined, SECRET, NOW)).toBeNull();
    expect(verifySessionToken("garbage", SECRET, NOW)).toBeNull();
  });
});
