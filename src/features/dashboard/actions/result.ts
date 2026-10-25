import type { DomainErrorCode } from "@/lib/domain/store";

/** What every dashboard server action returns, so screens can show a friendly message. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; code: DomainErrorCode | "unknown"; detail?: string };
