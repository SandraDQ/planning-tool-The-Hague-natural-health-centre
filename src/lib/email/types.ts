// Shared e-mail contract. Every e-mail the platform sends (booking confirmations,
// invoices, later reminders) goes through sendEmail() in ./send.ts.

import type { Locale } from "@/lib/domain/types";

export interface EmailAttachment {
  filename: string;
  /** e.g. "application/pdf" */
  contentType: string;
  contentBase64: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version (shown by simple mail apps and screen readers). */
  text: string;
  /** Where replies go, e.g. the therapist's public e-mail. */
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** What this is, for the log: "booking_confirmation", "invoice", "test", ... */
  kind: string;
  locale?: Locale;
}

export type EmailVia = "outbox" | "brevo" | "resend";

export interface EmailResult {
  /** Provider message id, or the outbox id. */
  id: string;
  via: EmailVia;
}

/** One entry of the e-mail log (the demo outbox, or a record of a real send). */
export interface OutboxEntry {
  id: string;
  at: string;
  kind: string;
  to: string;
  subject: string;
  via: EmailVia;
  /** Why it was not sent for real (demo mode, no key, not on the demo list). */
  heldBack: "no_provider" | "demo_recipient" | null;
  /** Kept in demo mode only, so the admin can look at the example. */
  html: string | null;
  attachmentNames: string[];
}
