import "server-only";

// Sends every issued invoice that has not been e-mailed yet (deposit, final, credit
// note, room rent), with its PDF attached. Called after each action that can issue an
// invoice; with a real database this becomes a queue worker. Failures are logged and
// retried on the next call, never shown to the person who clicked.

import type { Invoice } from "@/lib/domain/types";
import { renderInvoicePdf } from "@/lib/invoicing/pdf";
import { INVOICE_TEXT, euro, longDate, monthName } from "@/lib/invoicing/text";
import { getStore, isDemoMode } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";
import { sendInvoiceEmail, type InvoiceEmail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function invoiceFileName(inv: Invoice): string {
  const kind = { deposit: "aanbetaling", final: "factuur", credit_note: "creditnota", room_rent: "kamerhuur" }[inv.kind];
  return `${kind}-${inv.number ?? "concept"}.pdf`.replace(/[^a-z0-9.-]/gi, "-");
}

/** Subject and body of the e-mail that carries an invoice. Plain, short and kind. */
export function invoiceEmailContent(inv: Invoice): Pick<InvoiceEmail, "subject" | "text" | "html"> {
  const nl = inv.locale === "nl";
  const first = inv.buyer.name.split(" ")[0] || inv.buyer.name;
  const due = Math.max(0, inv.totalCents - inv.paidCents);
  const money = (c: number) => euro(c, inv.locale);
  const t = INVOICE_TEXT[inv.locale];
  let subject: string;
  let paragraphs: string[];
  switch (inv.kind) {
    case "deposit":
      subject = nl ? `Uw factuur voor de aanbetaling – ${inv.seller.name}` : `Your deposit invoice – ${inv.seller.name}`;
      paragraphs = nl
        ? [`Dank u voor uw boeking.`, `In de bijlage vindt u de factuur voor uw aanbetaling van ${money(inv.totalCents)}. Deze is al betaald, u hoeft niets te doen.`]
        : [`Thank you for your booking.`, `Attached is the invoice for your deposit of ${money(inv.totalCents)}. It has already been paid; there is nothing you need to do.`];
      break;
    case "final":
      subject = nl ? `Uw factuur – ${inv.seller.name}` : `Your invoice – ${inv.seller.name}`;
      paragraphs =
        due === 0
          ? nl
            ? [`In de bijlage vindt u de factuur voor uw sessie. Deze is volledig betaald. Dank u wel.`]
            : [`Attached is the invoice for your session. It has been paid in full. Thank you.`]
          : nl
            ? [`In de bijlage vindt u de factuur voor uw sessie.`, `Nog te betalen: ${money(due)}${inv.dueOn ? `, graag vóór ${longDate(inv.dueOn, inv.locale)}` : ""}.`]
            : [`Attached is the invoice for your session.`, `Still to pay: ${money(due)}${inv.dueOn ? `, please by ${longDate(inv.dueOn, inv.locale)}` : ""}.`];
      break;
    case "credit_note":
      subject = nl ? `Creditnota – ${inv.seller.name}` : `Credit note – ${inv.seller.name}`;
      paragraphs = nl
        ? [`We hebben ${money(-inv.totalCents)} aan u teruggestort.`, `In de bijlage vindt u de creditnota voor uw administratie.`]
        : [`We have refunded ${money(-inv.totalCents)} to you.`, `The credit note for your records is attached.`];
      break;
    case "room_rent": {
      const month = inv.rentMonth ? monthName(inv.rentMonth, inv.locale) : "";
      subject = nl ? `Factuur kamerhuur ${month}` : `Room rent invoice ${month}`;
      paragraphs = nl
        ? [
            `In de bijlage vindt u de factuur voor de kamerhuur van ${month}: ${money(inv.totalCents)}.`,
            inv.dueOn ? `Graag overmaken vóór ${longDate(inv.dueOn, inv.locale)}, onder vermelding van factuurnummer ${inv.number}.` : "",
          ]
        : [
            `Attached is the room rent invoice for ${month}: ${money(inv.totalCents)}.`,
            inv.dueOn ? `Please transfer by ${longDate(inv.dueOn, inv.locale)}, quoting invoice number ${inv.number}.` : "",
          ];
      break;
    }
  }
  const greeting = nl ? `Beste ${first},` : `Dear ${first},`;
  const closing = nl ? `Met vriendelijke groet,` : `Kind regards,`;
  const body = [greeting, ...paragraphs.filter(Boolean), `${closing}\n${inv.seller.name}`];
  const demo = isDemoMode() ? [t.demo] : [];
  return {
    subject,
    text: [...body, ...demo].join("\n\n"),
    html: [...body, ...demo].map((p) => `<p style="font-size:17px;line-height:1.5">${esc(p).replace(/\n/g, "<br>")}</p>`).join(""),
  };
}

/** E-mails all unsent invoices. Returns how many went out. Never throws. */
export async function deliverPendingInvoices(): Promise<number> {
  let sent = 0;
  try {
    const store = getStore();
    const pending = await store.invoices.listUnsent();
    for (const inv of pending) {
      try {
        const pdf = await renderInvoicePdf(inv, { demo: isDemoMode() });
        const content = invoiceEmailContent(inv);
        await sendInvoiceEmail({
          to: inv.buyer.email!,
          ...content,
          replyTo: inv.seller.email ?? undefined,
          attachments: [{ filename: invoiceFileName(inv), contentType: "application/pdf", contentBase64: Buffer.from(pdf).toString("base64") }],
          // D31: the admin sees room-rent invoices only, never a therapist's invoice to a client.
          kind: inv.kind === "room_rent" ? "invoice" : "client_invoice",
          locale: inv.locale,
        });
        await store.invoices.markSent(inv.id, inv.buyer.email!, new Date().toISOString());
        sent += 1;
      } catch (e) {
        logSafeError("[invoice delivery]", e);
      }
    }
  } catch (e) {
    logSafeError("[invoice delivery]", e);
  }
  return sent;
}
