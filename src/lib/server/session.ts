import "server-only";
import type { Role, Session } from "@/lib/domain/types";

// Current viewer. Demo sign-in cookie until Supabase Auth is connected (D22).
// Stub: the backend agent replaces this.
export async function getSession(): Promise<Session | null> {
  return null;
}

/** Redirects to the login page when the viewer lacks the role. */
export async function requireRole(role: Role, locale: string): Promise<Session> {
  void role;
  void locale;
  throw new Error("Session not implemented yet");
}
