// E-mail settings from the environment (names in .env.example). Pure: no secrets are
// returned except to the provider call in ./providers.ts.

export type EmailProvider = "brevo" | "resend";

export interface EmailConfig {
  /** null = no provider connected: every e-mail goes to the outbox only. */
  provider: EmailProvider | null;
  /** "Name <address>" or a bare address. */
  from: string;
  /** Demo mode: the only addresses that get real e-mail. Lower case. */
  demoRecipients: string[];
}

export const DEFAULT_FROM = "The Hague Natural Health Centre <bookings@thehague-naturalhealthcentre.com>";

const set = (v: string | undefined) => Boolean(v?.trim());

export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const name = env.EMAIL_PROVIDER?.trim().toLowerCase();
  const provider: EmailProvider | null = set(env.EMAIL_API_KEY) ? (name === "resend" ? "resend" : "brevo") : null;
  const demoRecipients = (env.EMAIL_DEMO_RECIPIENTS ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
  return { provider, from: env.EMAIL_FROM?.trim() || DEFAULT_FROM, demoRecipients };
}

/** Splits "Name <a@b.c>" into its parts. */
export function parseAddress(value: string): { name: string | null; email: string } {
  const m = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value);
  if (m) return { name: m[1].replace(/^"|"$/g, "") || null, email: m[2] };
  return { name: null, email: value.trim() };
}

/**
 * Decides whether a message may really be sent (D48). In demo mode only addresses on
 * EMAIL_DEMO_RECIPIENTS get real e-mail, so the public demo can never be used to send
 * mail from the centre's domain to strangers.
 */
export function deliveryDecision(cfg: EmailConfig, to: string, demo: boolean): "send" | "no_provider" | "demo_recipient" {
  if (!cfg.provider) return "no_provider";
  if (demo && !cfg.demoRecipients.includes(to.trim().toLowerCase())) return "demo_recipient";
  return "send";
}
