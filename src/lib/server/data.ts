import "server-only";
import type { AppStore } from "./extensions";
import { getDemoStore } from "./demo";
import { hasRealBackend } from "./mode";

/**
 * Returns the active data store. Demo (in-memory) until Supabase is connected (D21).
 * AppStore = the DataStore contract plus a few MVP extras (see ./extensions.ts).
 */
export function getStore(): AppStore {
  if (hasRealBackend()) {
    // TODO(phase 3): return the Supabase implementation. Until it exists, refuse to
    // serve demo data on a deployment that has real keys (D22).
    throw new Error("Supabase data store is not implemented yet; remove SUPABASE_* keys to run in demo mode");
  }
  return getDemoStore();
}

export { isDemoMode } from "./mode";
