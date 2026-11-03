import "server-only";

// Invoice e-mails go through the platform's one shared e-mail sender (Brevo or Resend,
// D48): `sendEmail` in "@/lib/email/send". In the demo, mail that may not really go out
// lands in the admin outbox (Admin → E-mails). Never add a second e-mail provider client here.

import { sendEmail } from "@/lib/email/send";
import type { EmailMessage, EmailResult } from "@/lib/email/types";

export type InvoiceEmail = EmailMessage;
export type SentEmail = EmailResult;

export async function sendInvoiceEmail(msg: InvoiceEmail): Promise<SentEmail> {
  return sendEmail(msg);
}
