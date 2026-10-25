// Pure demo-mode checks (no "server-only", so src/instrumentation.ts can import them).
// App code imports ./mode instead.
// Demo mode (D21/D22/D28). It is OFF unless DEMO_MODE=1 is set explicitly, and it refuses
// to run next to any real service key, so a deployment with real data can never fall back
// to the open demo login. `next dev` sets DEMO_MODE=1 by default (next.config.ts).

/** Variables that mean real services or real data are connected. */
export const REAL_SERVICE_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "MOLLIE_API_KEY",
  "MONEYBIRD_TOKEN",
  "EMAIL_API_KEY",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_SECRET",
] as const;

const isSet = (name: string) => Boolean(process.env[name]?.trim());

/** Names (never values) of the real service keys that are set. */
export function realKeysPresent(): string[] {
  return REAL_SERVICE_KEYS.filter(isSet);
}

/** Both Supabase server keys are set (the future real data store). */
export function hasRealBackend(): boolean {
  return isSet("SUPABASE_URL") && isSet("SUPABASE_SERVICE_ROLE_KEY");
}

const demoRequested = () => process.env.DEMO_MODE === "1";

/** True only when DEMO_MODE=1 and no real service key is set (fail closed). */
export function isDemoMode(): boolean {
  return demoRequested() && realKeysPresent().length === 0;
}

/**
 * Throws when the demo configuration is unsafe: DEMO_MODE=1 next to a real key, or a
 * production demo without a DEMO_SESSION_SECRET of 32+ characters. Called at startup
 * (src/instrumentation.ts) and again by getStore()/getSession().
 */
export function assertSafeMode(): void {
  if (!demoRequested()) return;
  const keys = realKeysPresent();
  if (keys.length > 0) {
    throw new Error(`DEMO_MODE=1 is not allowed while real service keys are set (${keys.join(", ")}). Remove DEMO_MODE or the keys.`);
  }
  if (process.env.NODE_ENV === "production" && (process.env.DEMO_SESSION_SECRET ?? "").length < 32) {
    throw new Error("DEMO_MODE=1 in production needs DEMO_SESSION_SECRET with at least 32 characters.");
  }
}
