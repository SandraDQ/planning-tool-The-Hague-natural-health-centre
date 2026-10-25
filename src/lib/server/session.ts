import "server-only";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import type { Role, Session } from "@/lib/domain/types";
import { findDemoAccount } from "./demo";
import { isDemoMode } from "./mode";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "./session-token";

// Current viewer. Demo sign-in cookie until Supabase Auth is connected (D22).

export async function getSession(): Promise<Session | null> {
  if (!isDemoMode()) return null; // TODO(phase 3): Supabase Auth (magic link + TOTP, D17)
  const jar = await cookies();
  const accountId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!accountId) return null;
  return findDemoAccount(accountId)?.session ?? null;
}

/** Redirects to the login page when the viewer lacks the role. */
export async function requireRole(role: Role, locale: string): Promise<Session> {
  const session = await getSession();
  if (!session || session.role !== role) {
    redirect({ href: "/login", locale });
  }
  return session!;
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): "/admin" | "/therapist" | "/account" {
  return role === "admin" ? "/admin" : role === "therapist" ? "/therapist" : "/account";
}

/** Demo only: sign in as one of the demo accounts. Returns the session, or null for an unknown account. */
export async function signInDemo(accountId: string): Promise<Session | null> {
  if (!isDemoMode()) return null;
  const account = findDemoAccount(accountId);
  if (!account) return null;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(account.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return account.session;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
