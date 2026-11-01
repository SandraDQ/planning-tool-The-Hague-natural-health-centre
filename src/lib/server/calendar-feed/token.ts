// Signed, revocable calendar-feed links (7A). The token names whose feed it is and a
// version; resetting the link bumps the version, so old links stop working.
// Pure (no Next.js imports) so it can be unit tested.

import { createHmac, timingSafeEqual } from "node:crypto";

export type FeedSubject = { kind: "therapist"; id: string } | { kind: "admin" };

interface Payload {
  k: "t" | "a";
  id?: string;
  v: number;
}

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(`calendar-feed:${data}`).digest("base64url");

export function feedKey(subject: FeedSubject): string {
  return subject.kind === "admin" ? "admin" : `therapist:${subject.id}`;
}

export function createFeedToken(subject: FeedSubject, version: number, secret: string): string {
  const payload: Payload = subject.kind === "admin" ? { k: "a", v: version } : { k: "t", id: subject.id, v: version };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** The subject and version, or null when the token is malformed or forged. The caller checks the version. */
export function readFeedToken(token: string, secret: string): { subject: FeedSubject; version: number } | null {
  if (!token || token.length > 512) return null;
  const [data, sig, extra] = token.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Payload;
    if (!Number.isInteger(p.v) || p.v < 0) return null;
    if (p.k === "a") return { subject: { kind: "admin" }, version: p.v };
    if (p.k === "t" && typeof p.id === "string" && p.id.length > 0 && p.id.length <= 100) {
      return { subject: { kind: "therapist", id: p.id }, version: p.v };
    }
    return null;
  } catch {
    return null;
  }
}
