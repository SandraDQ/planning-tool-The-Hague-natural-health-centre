import "server-only";
import { DomainError } from "@/lib/domain/store";
import { logSafeError, publicErrorDetail } from "@/lib/server/errors";
import type { ActionResult } from "./result";

/** Runs a store call and turns DomainErrors into an ActionResult (redirects still propagate). */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof DomainError || (e instanceof Error && e.name === "DomainError")) {
      const err = e as DomainError;
      return { ok: false, code: err.code, detail: err.message !== err.code ? publicErrorDetail(err.message, err.code) : undefined };
    }
    // Next.js uses thrown errors for redirect()/notFound(); let those through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    logSafeError("[dashboard action]", e);
    return { ok: false, code: "unknown" };
  }
}
