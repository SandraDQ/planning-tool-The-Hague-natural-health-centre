import "server-only";
import { isDemoMode } from "./mode";

// Review F7: never log or return whole unknown errors. Database errors (PostgREST/pg)
// carry row values such as e-mail addresses, and hosting logs are outside the DPA scope.

/** The only parts of an unknown error that are safe to log: no message, no details. */
export function safeErrorSummary(e: unknown): { name: string; code?: string; digest?: string } {
  const o = (e && typeof e === "object" ? e : {}) as { name?: unknown; code?: unknown; digest?: unknown };
  return {
    name: typeof o.name === "string" ? o.name : typeof e,
    ...(typeof o.code === "string" ? { code: o.code } : {}),
    ...(typeof o.digest === "string" ? { digest: o.digest } : {}),
  };
}

/** console.error with the safe summary only. */
export function logSafeError(label: string, e: unknown): void {
  console.error(label, safeErrorSummary(e));
}

/** A DomainError's English detail may go to the browser only in demo/dev, never with real data. */
export function publicErrorDetail(message: string | undefined, code: string): string | undefined {
  if (!message || message === code) return undefined;
  return isDemoMode() || process.env.NODE_ENV === "development" ? message : undefined;
}
