import "server-only";
import type { DataStore } from "@/lib/domain/store";

// Returns the active data store. Demo (in-memory) until Supabase is connected (D21).
// Stub: the backend agent replaces this with the demo implementation.
export function getStore(): DataStore {
  throw new Error("Data store not implemented yet");
}
