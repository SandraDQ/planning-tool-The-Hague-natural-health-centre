// The quarter export for the accountant: one spreadsheet (CSV) with every sales invoice,
// other income and cost, plus a short BTW summary underneath. Labels come from the caller.

import type { BtwTreatment, CostCategory, Expense, Invoice } from "@/lib/domain/types";
import { btwByRate } from "@/lib/invoicing/btw";
import { type CsvCell, type CsvFormat, csvAmount } from "./csv";
import { RECEIPT_EXT } from "./receipt-file";
import { type BooksInput, btwQuarter } from "./summary";

export interface ExportLabels {
  header: string[];
  sale: string;
  creditNote: string;
  otherIncome: string;
  cost: string;
  invoiceKind: (inv: Invoice) => string;
  category: (c: CostCategory) => string;
  rate: (t: BtwTreatment) => string;
  summaryTitle: string;
  box1a: string;
  box1b: string;
  exemptSales: string;
  box5b: string;
  balance: string;
  note: string;
}

/** Path of a cost's receipt inside the zip (also printed in the spreadsheet). */
export const receiptPath = (e: Expense) =>
  e.receipt ? `receipts/${e.date}_${e.supplier.replace(/[^\w\-]+/g, "-").slice(0, 30)}_${e.id.slice(0, 8)}.${RECEIPT_EXT[e.receipt.mimeType]}` : null;

export function booksCsvRows(input: BooksInput, from: string, to: string, f: CsvFormat, l: ExportLabels): CsvCell[][] {
  const a = (cents: number) => csvAmount(cents, f);
  const rows: CsvCell[][] = [l.header];
  const inRange = (d: string) => d >= from && d < to;

  type Row = { day: string; cells: CsvCell[] };
  const body: Row[] = [];
  for (const inv of input.invoices) {
    if (inv.status !== "issued" || !inv.issuedAt) continue;
    const day = input.dayOf(inv.issuedAt);
    if (!inRange(day)) continue;
    for (const r of btwByRate(inv.lines)) {
      body.push({
        day,
        cells: [
          inv.kind === "credit_note" ? l.creditNote : l.sale,
          day,
          inv.number,
          `${inv.buyer.name} · ${l.invoiceKind(inv)}`,
          "",
          a(r.netCents),
          l.rate(r.treatment),
          a(r.btwCents),
          a(r.netCents + r.btwCents),
          inv.paidOn ?? "",
          "",
        ],
      });
    }
  }
  for (const t of input.transactions) {
    if (t.match?.kind !== "other_income" || !inRange(t.bookedOn)) continue;
    body.push({ day: t.bookedOn, cells: [l.otherIncome, t.bookedOn, "", `${t.counterparty} · ${t.description}`, "", a(t.amountCents), l.rate("exempt"), a(0), a(t.amountCents), t.bookedOn, ""] });
  }
  for (const e of input.expenses) {
    if (!inRange(e.date)) continue;
    const paid = e.bankTransactionId ? input.transactions.find((t) => t.id === e.bankTransactionId)?.bookedOn ?? "" : "";
    body.push({
      day: e.date,
      cells: [l.cost, e.date, e.supplier, e.description, l.category(e.category), a(-e.netCents), l.rate(e.btwRate), a(-e.btwCents), a(-e.grossCents), paid, receiptPath(e) ?? ""],
    });
  }
  body.sort((x, y) => x.day.localeCompare(y.day));
  rows.push(...body.map((r) => r.cells));

  const s = btwQuarter(input, from, to);
  rows.push([], [l.summaryTitle]);
  rows.push([l.box1a, a(s.sales["21"].netCents), a(s.sales["21"].btwCents)]);
  rows.push([l.box1b, a(s.sales["9"].netCents), a(s.sales["9"].btwCents)]);
  rows.push([l.exemptSales, a(s.sales.exempt.netCents), ""]);
  rows.push([l.box5b, "", a(s.inputBtwCents)]);
  rows.push([l.balance, "", a(s.balanceCents)]);
  rows.push([l.note]);
  return rows;
}
