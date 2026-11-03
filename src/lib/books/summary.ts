// Totals for the bookkeeping pages: a month's income vs costs, and the BTW quarter.
// Pure: the caller passes the owner's invoices, costs and bank items, and how to turn
// an instant into a local day. Income is counted when invoiced (not when paid).

import type { BankTransaction, BtwTreatment, CostCategory, Expense, Invoice } from "@/lib/domain/types";
import { btwByRate } from "@/lib/invoicing/btw";

type DayOf = (iso: string) => string;
const inRange = (day: string, from: string, to: string) => day >= from && day < to;

export interface BooksInput {
  /** Issued invoices the owner sent (sales). */
  invoices: Invoice[];
  expenses: Expense[];
  transactions: BankTransaction[];
  /** False for KOR and BTW-exempt owners: BTW on costs is then part of the cost. */
  deductsBtw: boolean;
  dayOf: DayOf;
}

/** A cost still waiting for its receipt. Bank fees need none: the bank statement is the proof. */
export const needsReceipt = (e: Expense) => !e.receipt && e.category !== "bank_fees";

/** What a cost weighs in the result: excl. BTW when the BTW comes back, otherwise all of it. */
export const costWeight = (e: Expense, deductsBtw: boolean) => (deductsBtw ? e.netCents : e.grossCents);

export interface PeriodTotals {
  /** Invoiced in the period, excl. BTW (credit notes subtract). */
  invoicedNetCents: number;
  /** Bank income marked "other income" (no invoice). */
  otherIncomeCents: number;
  costsCents: number;
  /** Income − costs, before income tax. */
  resultCents: number;
  /** Invoiced incl. BTW that is still not paid (of invoices from this period). */
  stillToReceiveCents: number;
  costCount: number;
  missingReceipts: number;
}

export function periodTotals(input: BooksInput, from: string, to: string): PeriodTotals {
  const invoices = input.invoices.filter((i) => i.status === "issued" && i.issuedAt && inRange(input.dayOf(i.issuedAt), from, to));
  const expenses = input.expenses.filter((e) => inRange(e.date, from, to));
  const invoicedNetCents = invoices.reduce((n, i) => n + i.subtotalCents, 0);
  const otherIncomeCents = input.transactions
    .filter((t) => t.match?.kind === "other_income" && inRange(t.bookedOn, from, to))
    .reduce((n, t) => n + t.amountCents, 0);
  const costsCents = expenses.reduce((n, e) => n + costWeight(e, input.deductsBtw), 0);
  const stillToReceiveCents = invoices.filter((i) => i.totalCents > 0).reduce((n, i) => n + Math.max(0, i.totalCents - i.paidCents), 0);
  return {
    invoicedNetCents,
    otherIncomeCents,
    costsCents,
    resultCents: invoicedNetCents + otherIncomeCents - costsCents,
    stillToReceiveCents,
    costCount: expenses.length,
    missingReceipts: expenses.filter(needsReceipt).length,
  };
}

/** Costs of a period per category, biggest first. */
export function costsByCategory(input: BooksInput, from: string, to: string): Array<{ category: CostCategory; cents: number; count: number }> {
  const map = new Map<CostCategory, { category: CostCategory; cents: number; count: number }>();
  for (const e of input.expenses) {
    if (!inRange(e.date, from, to)) continue;
    const row = map.get(e.category) ?? { category: e.category, cents: 0, count: 0 };
    row.cents += costWeight(e, input.deductsBtw);
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export interface BtwQuarterSummary {
  /** Sales per rate (box 1a = 21%, 1b = 9%), excl. BTW, and the BTW on them. */
  sales: Record<BtwTreatment, { netCents: number; btwCents: number }>;
  /** BTW on costs that can be deducted (box 5b). 0 when the owner does not deduct. */
  inputBtwCents: number;
  /** Sales BTW − input BTW. Negative = money back. */
  balanceCents: number;
  invoiceCount: number;
  costCount: number;
  missingReceipts: number;
  /** Bank payments of the quarter nobody looked at yet. */
  unmatchedTransactions: number;
}

export function btwQuarter(input: BooksInput, from: string, to: string): BtwQuarterSummary {
  const sales: BtwQuarterSummary["sales"] = { "21": { netCents: 0, btwCents: 0 }, "9": { netCents: 0, btwCents: 0 }, exempt: { netCents: 0, btwCents: 0 } };
  const invoices = input.invoices.filter((i) => i.status === "issued" && i.issuedAt && inRange(input.dayOf(i.issuedAt), from, to));
  for (const inv of invoices) {
    for (const row of btwByRate(inv.lines)) {
      sales[row.treatment].netCents += row.netCents;
      sales[row.treatment].btwCents += row.btwCents;
    }
  }
  const expenses = input.expenses.filter((e) => inRange(e.date, from, to));
  const inputBtwCents = input.deductsBtw ? expenses.reduce((n, e) => n + e.btwCents, 0) : 0;
  return {
    sales,
    inputBtwCents,
    balanceCents: sales["21"].btwCents + sales["9"].btwCents - inputBtwCents,
    invoiceCount: invoices.length,
    costCount: expenses.length,
    missingReceipts: expenses.filter(needsReceipt).length,
    unmatchedTransactions: input.transactions.filter((t) => !t.match && inRange(t.bookedOn, from, to)).length,
  };
}
