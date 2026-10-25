import "server-only";
import type { AppStore } from "./extensions";
import { getDemoStore } from "./demo";
import { assertSafeMode, hasRealBackend, isDemoMode } from "./mode";

/**
 * Returns the active data store. Demo (in-memory) until Supabase is connected (D21, D28).
 * AppStore = the DataStore contract plus a few MVP extras (see ./extensions.ts).
 */
export function getStore(): AppStore {
  assertSafeMode();
  if (isDemoMode()) return getDemoStore();
  if (hasRealBackend()) {
    // TODO(phase 3): return the Supabase implementation.
    throw new Error("Supabase data store is not implemented yet");
  }
  throw new Error("No data store configured: set DEMO_MODE=1 for the demo (see .env.example)");
}

export { isDemoMode } from "./mode";
