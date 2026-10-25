// Deterministic ids for seeded rows (UUIDv5, RFC 9562), so every server instance
// that seeds in the same week holds identical data. Runtime rows use randomUUID().

import { createHash } from "node:crypto";

/** Fixed namespace for THNHC demo data (a random UUID, chosen once). */
const NAMESPACE = "6f1d3c2a-8b4e-4c7a-9e21-5d0b7a9c3f10";

export function stableId(key: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const bytes = createHash("sha1").update(ns).update(key, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
