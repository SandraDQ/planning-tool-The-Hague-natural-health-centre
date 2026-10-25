// Demo mode (D21/D22): on until Supabase is connected. It can never run next to
// real keys, so a deployment with Supabase configured cannot fall back to demo data.

export function hasRealBackend(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isDemoMode(): boolean {
  return !hasRealBackend();
}
