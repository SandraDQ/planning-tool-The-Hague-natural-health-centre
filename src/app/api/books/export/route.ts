import { getTranslations } from "next-intl/server";
import { csvFormatFor, toCsv } from "@/lib/books/csv";
import { booksCsvRows, receiptPath, type ExportLabels } from "@/lib/books/export";
import { parseQuarter, quarterBounds } from "@/lib/books/periods";
import { buildZip, type ZipEntry } from "@/lib/books/zip";
import type { BtwTreatment, CostCategory, Invoice } from "@/lib/domain/types";
import { renderInvoicePdf } from "@/lib/invoicing/pdf";
import { getStore, isDemoMode } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";
import { invoiceFileName } from "@/lib/server/invoicing/deliver";
import { getSession } from "@/lib/server/session";
import { localDay } from "@/features/dashboard/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/export?quarter=2026-Q4&format=zip|csv&locale=nl → the quarter for the
 * accountant: a spreadsheet, or a zip with the spreadsheet, all receipts and all invoices.
 * Only for the owner of the books (admin: the centre; a therapist with the add-on).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const quarter = parseQuarter(url.searchParams.get("quarter"));
  const format = url.searchParams.get("format") === "csv" ? "csv" : "zip";
  const locale = url.searchParams.get("locale") === "en" ? "en" : "nl";
  try {
    const session = await getSession();
    if (!session || !quarter) return notFound();
    const store = getStore();
    const books = await store.books.getBooks(session);
    const t = await getTranslations({ locale, namespace: "books" });
    const labels: ExportLabels = {
      header: t.raw("export.header") as string[],
      sale: t("export.sale"),
      creditNote: t("export.creditNote"),
      otherIncome: t("export.otherIncome"),
      cost: t("export.cost"),
      invoiceKind: (inv: Invoice) => t(`export.kinds.${inv.kind}`),
      category: (c: CostCategory) => t(`categories.${c}`),
      rate: (r: BtwTreatment) => t(`rates.${r}`),
      summaryTitle: t("export.summaryTitle"),
      box1a: t("export.box1a"),
      box1b: t("export.box1b"),
      exemptSales: t("export.exemptSales"),
      box5b: t("export.box5b"),
      balance: t("export.balance"),
      note: t("export.note"),
    };
    const { first, next } = quarterBounds(quarter);
    const input = { invoices: books.invoices, expenses: books.expenses, transactions: books.transactions, deductsBtw: books.deductsBtw, dayOf: localDay };
    const csv = toCsv(booksCsvRows(input, first, next, csvFormatFor(locale), labels), csvFormatFor(locale));
    const base = `${t("export.fileName")}-${quarter}`;
    const headers = (type: string, name: string) => ({
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (format === "csv") return new Response(csv, { headers: headers("text/csv; charset=utf-8", `${base}.csv`) });

    const entries: ZipEntry[] = [{ name: `${base}.csv`, data: new TextEncoder().encode(csv) }];
    for (const e of books.expenses) {
      const path = receiptPath(e);
      if (!path || e.date < first || e.date >= next) continue;
      const { data } = await store.books.readReceipt(session, e.id);
      entries.push({ name: path, data });
    }
    const demo = isDemoMode();
    for (const inv of books.invoices) {
      if (!inv.issuedAt) continue;
      const day = localDay(inv.issuedAt);
      if (day < first || day >= next) continue;
      entries.push({ name: `invoices/${invoiceFileName(inv)}`, data: await renderInvoicePdf(inv, { demo }) });
    }
    return new Response(Buffer.from(buildZip(entries)), { headers: headers("application/zip", `${base}.zip`) });
  } catch (e) {
    if (!(e instanceof Error && e.name === "DomainError")) logSafeError("[books export]", e);
    return notFound();
  }
}
