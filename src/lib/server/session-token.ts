// Signed demo-session token: base64url(payload).base64url(HMAC-SHA256(payload)).
// Pure (no Next.js imports) so it can be unit tested.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "thnhc_demo_session";
/** Demo sessions last 7 days. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SECRET_KEY = Symbol.for("thnhc.demo.sessionSecret");

/** DEMO_SESSION_SECRET, or a random secret per server process (sessions then end on restart). */
export function sessionSecret(): string {
  const fromEnv = process.env.DEMO_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const g = globalThis as typeof globalThis & { [SECRET_KEY]?: string };
  g[SECRET_KEY] ??= randomBytes(32).toString("base64url");
  return g[SECRET_KEY]!;
}

interface Payload {
  v: 1;
  /** Demo account id (see listDemoAccounts). */
  a: string;
  /** Issued at, epoch seconds. */
  iat: number;
}

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function createSessionToken(accountId: string, secret = sessionSecret(), nowMs = Date.now()): string {
  const payload: Payload = { v: 1, a: accountId, iat: Math.floor(nowMs / 1000) };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** Returns the account id, or null when the token is missing, forged or expired. */
export function verifySessionToken(token: string | undefined, secret = sessionSecret(), nowMs = Date.now()): string | null {
  if (!token || token.length > 2048) return null;
  const [data, sig, extra] = token.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Payload;
    if (payload.v !== 1 || typeof payload.a !== "string" || typeof payload.iat !== "number") return null;
    const age = nowMs / 1000 - payload.iat;
    if (age < -60 || age > SESSION_MAX_AGE_SECONDS) return null;
    return payload.a;
  } catch {
    return null;
  }
}
