import "server-only";

// The two supported providers, called over HTTPS with fetch (no SDKs). Brevo (EU, default)
// and Resend. Only this file reads EMAIL_API_KEY; it is never logged or returned.

import { parseAddress, type EmailProvider } from "./config";
import type { EmailMessage } from "./types";

export class EmailSendError extends Error {
  /** Safe to log (see logSafeError): the HTTP status only. */
  code: string;
  constructor(
    public provider: EmailProvider,
    public status: number,
  ) {
    super(`E-mail provider ${provider} answered ${status}`);
    this.name = "EmailSendError";
    this.code = `${provider}_http_${status}`;
  }
}

async function brevo(key: string, from: string, msg: EmailMessage): Promise<string> {
  const sender = parseAddress(from);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) },
      to: [{ email: msg.to }],
      ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      ...(msg.attachments?.length ? { attachment: msg.attachments.map((a) => ({ name: a.filename, content: a.contentBase64 })) } : {}),
      tags: [msg.kind],
    }),
  });
  if (!res.ok) throw new EmailSendError("brevo", res.status);
  const body = (await res.json().catch(() => ({}))) as { messageId?: string };
  return body.messageId ?? "brevo";
}

async function resend(key: string, from: string, msg: EmailMessage): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [msg.to],
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.attachments?.length
        ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.contentBase64, content_type: a.contentType })) }
        : {}),
      tags: [{ name: "kind", value: msg.kind.replace(/[^A-Za-z0-9_-]/g, "_") }],
    }),
  });
  if (!res.ok) throw new EmailSendError("resend", res.status);
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return body.id ?? "resend";
}

export function sendWithProvider(provider: EmailProvider, from: string, msg: EmailMessage): Promise<string> {
  const key = process.env.EMAIL_API_KEY?.trim();
  if (!key) throw new Error("EMAIL_API_KEY is not set");
  return provider === "resend" ? resend(key, from, msg) : brevo(key, from, msg);
}
