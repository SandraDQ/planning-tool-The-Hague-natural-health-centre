import "server-only";

// Signed link in the confirmation e-mail that lets a guest cancel their own appointment
// without an account. Holds the appointment id only, HMAC-signed with the server secret
// (same scheme as the booking cookie). The store still applies the cancellation policy,
// and nothing can be cancelled once the session has started.

import { signValue, verifySignedValue } from "@/lib/server/session-token";

const PURPOSE = "manage-booking";

// "~" instead of "." between id and signature: the middleware skips paths with a dot (files).
export function manageToken(appointmentId: string): string {
  return signValue(PURPOSE, appointmentId).replace(/\.(?=[^.]*$)/, "~");
}

/** The appointment id, or null for a forged or broken link. */
export function readManageToken(token: string): string | null {
  const raw = decodeURIComponent(token);
  if (raw.includes(".")) return null;
  const id = verifySignedValue(PURPOSE, raw.replace(/~(?=[^~]*$)/, "."));
  return id && /^[A-Za-z0-9_:-]{1,64}$/.test(id) ? id : null;
}

/** Base address for links in e-mails: SITE_URL, else Vercel's production address, else the centre's site. */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://www.thehague-naturalhealthcentre.com";
}

export function manageUrl(appointmentId: string, locale: string): string {
  return `${siteUrl()}/${locale}/book/manage/${encodeURIComponent(manageToken(appointmentId))}`;
}
