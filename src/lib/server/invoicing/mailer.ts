import "server-only";

// Invoice e-mails go through the platform's one shared e-mail sender (Brevo or Resend,
// built in the "Connect domain and confirmation emails" work: `sendEmail` in
// "@/lib/email/send"). Until that is merged here, this keeps the same message shape and
// writes to a demo outbox, so switching is a one-line change in `sendInvoiceEmail`.
// Never add a second e-mail provider client here.

export interface InvoiceEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
  kind: string;
  locale?: "nl" | "en";
}

export interface SentEmail {
  id: string;
  via: "outbox" | "brevo" | "resend";
}

export interface OutboxEntry extends InvoiceEmail {
  id: string;
  at: string;
}

const KEY = Symbol.for("thnhc.invoice.outbox");
type WithOutbox = typeof globalThis & { [KEY]?: OutboxEntry[] };

function outbox(): OutboxEntry[] {
  const g = globalThis as WithOutbox;
  return (g[KEY] ??= []);
}

export async function sendInvoiceEmail(msg: InvoiceEmail): Promise<SentEmail> {
  // TODO(email): `return sendEmail(msg)` from "@/lib/email/send" once that module is on this branch.
  const id = `outbox_${crypto.randomUUID()}`;
  const list = outbox();
  list.unshift({ ...msg, id, at: new Date().toISOString() });
  list.length = Math.min(list.length, 200);
  return { id, via: "outbox" };
}

/** Demo outbox (newest first), without attachments' contents. */
export function listInvoiceOutbox(): Array<Omit<OutboxEntry, "attachments"> & { attachmentNames: string[] }> {
  return outbox().map(({ attachments, ...rest }) => ({ ...rest, attachmentNames: (attachments ?? []).map((a) => a.filename) }));
}
