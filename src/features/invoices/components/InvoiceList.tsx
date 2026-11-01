import { getFormatter, getTranslations } from "next-intl/server";
import { Icons } from "@/design-system";
import type { Invoice, Locale } from "@/lib/domain/types";
import { invoicePaymentStatus } from "@/lib/invoicing/status";
import { formatEuro } from "@/features/dashboard/money";
import { PdfLink, StatusBadge } from "./InvoiceBits";

/**
 * A plain list of issued invoices: who, what, how much, paid or not, and a button to
 * open the PDF. Cards rather than a wide table, so it reads well on a phone.
 */
export async function InvoiceList({
  invoices,
  today,
  locale,
  show,
}: {
  invoices: Invoice[];
  today: string;
  locale: Locale;
  /** Whose name to show on each row. */
  show: "buyer" | "seller";
}) {
  const t = await getTranslations("invoices.common");
  const format = await getFormatter();
  return (
    <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
      {invoices.map((inv) => {
        const status = invoicePaymentStatus(inv, today);
        const name = show === "buyer" ? inv.buyer.name : inv.seller.name;
        return (
          <li key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-lg">{name}</p>
              <p className="text-base text-fg-muted">
                {t(`kind.${inv.kind}`)} {inv.number} · {inv.issuedAt ? format.dateTime(new Date(inv.issuedAt), { day: "numeric", month: "long", year: "numeric" }) : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tabular-nums">{formatEuro(inv.totalCents, locale)}</span>
                <StatusBadge status={status} label={t(`status.${status}`)} />
                {status === "open" && inv.dueOn && (
                  <span className="text-sm text-fg-muted">{t("dueOn", { date: format.dateTime(new Date(`${inv.dueOn}T12:00:00Z`), { day: "numeric", month: "long" }) })}</span>
                )}
              </div>
              {show === "buyer" && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                  <Icons.Mail className="size-4 shrink-0" />
                  {inv.sentAt
                    ? t("sentOn", { date: format.dateTime(new Date(inv.sentAt), { day: "numeric", month: "long" }) })
                    : inv.buyer.email
                      ? t("notSent")
                      : t("noEmail")}
                </p>
              )}
            </div>
            <PdfLink invoiceId={inv.id} label={t("openPdf")} ariaLabel={t("openPdfLabel", { number: inv.number ?? "" })} className="self-start sm:self-center" />
          </li>
        );
      })}
    </ul>
  );
}
