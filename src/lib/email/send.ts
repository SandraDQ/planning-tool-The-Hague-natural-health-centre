import "server-only";

// The one way the platform sends e-mail. Used by booking confirmations and invoices.
//
//   import { sendEmail } from "@/lib/email/send";
//   await sendEmail({ to, subject, html, text, replyTo, attachments, kind: "invoice", locale });
//
// - No EMAIL_API_KEY: nothing leaves the server; the message goes to the outbox.
// - Demo mode with a key: only addresses on EMAIL_DEMO_RECIPIENTS get real mail (D48).
// - Errors from the provider are thrown (EmailSendError, status only, never the key).

import { randomUUID } from "node:crypto";
import { isDemoMode } from "@/lib/server/mode";
import { deliveryDecision, readEmailConfig } from "./config";
import { recordEmail } from "./outbox";
import { sendWithProvider } from "./providers";
import type { EmailMessage, EmailResult } from "./types";

/** Kinds whose subject and content the admin may not see in the e-mail log. */
const PRIVATE_KINDS = new Set(["client_invoice"]);

const isAddress = (s: string) => s.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!isAddress(msg.to)) throw new Error("Invalid recipient address");
  if (msg.replyTo && !isAddress(msg.replyTo)) throw new Error("Invalid reply-to address");
  const cfg = readEmailConfig();
  const demo = isDemoMode();
  const decision = deliveryDecision(cfg, msg.to, demo);
  // The log is shown to the admin (Admin → E-mails). A therapist's invoice to a client is
  // logged without its subject, content or attachment names (D31).
  const hidden = PRIVATE_KINDS.has(msg.kind);
  const base = {
    at: new Date().toISOString(),
    kind: msg.kind,
    to: msg.to,
    subject: hidden ? "" : msg.subject,
    // Content is kept only for the demo outbox; real client e-mails are not stored in memory.
    html: demo && !hidden ? msg.html : null,
    attachmentNames: hidden ? [] : (msg.attachments ?? []).map((a) => a.filename),
  };

  if (decision !== "send") {
    const id = `outbox_${randomUUID()}`;
    recordEmail({ ...base, id, via: "outbox", heldBack: decision });
    return { id, via: "outbox" };
  }

  const id = await sendWithProvider(cfg.provider!, cfg.from, msg);
  recordEmail({ ...base, id, via: cfg.provider!, heldBack: null });
  return { id, via: cfg.provider! };
}

/** Status line for the admin e-mail page. Never includes the key. */
export function emailStatus() {
  const cfg = readEmailConfig();
  return { provider: cfg.provider, from: cfg.from, demo: isDemoMode(), demoRecipients: cfg.demoRecipients };
}
