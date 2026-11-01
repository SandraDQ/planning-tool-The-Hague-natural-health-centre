import "server-only";

// In-memory e-mail log. In demo mode it is the "outbox": every e-mail the platform would
// send, viewable by the admin. With a real database this becomes the email_log table
// (supabase/migrations/20261101000011_email.sql). Resets on redeploy, like the demo data.

import type { OutboxEntry } from "./types";

const KEY = Symbol.for("thnhc.email.outbox");
const MAX = 200;
type WithOutbox = typeof globalThis & { [KEY]?: { entries: OutboxEntry[]; claimed: Set<string> } };

function box() {
  const g = globalThis as WithOutbox;
  g[KEY] ??= { entries: [], claimed: new Set() };
  return g[KEY]!;
}

export function recordEmail(entry: OutboxEntry): void {
  const b = box();
  b.entries.unshift(entry);
  if (b.entries.length > MAX) b.entries.length = MAX;
}

/** Newest first. */
export function listOutbox(): OutboxEntry[] {
  return box().entries.map((e) => ({ ...e }));
}

export function getOutboxEntry(id: string): OutboxEntry | null {
  const e = box().entries.find((x) => x.id === id);
  return e ? { ...e } : null;
}

/** True the first time a key is claimed: one confirmation per appointment, even on webhook retries. */
export function claimOnce(key: string): boolean {
  const b = box();
  if (b.claimed.has(key)) return false;
  b.claimed.add(key);
  return true;
}

export function releaseClaim(key: string): void {
  box().claimed.delete(key);
}

/** Demo reset and tests. */
export function clearOutbox(): void {
  delete (globalThis as WithOutbox)[KEY];
}
