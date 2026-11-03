// Suggestions for bank payments nobody looked at yet: which invoice was paid, or which
// cost it was. Only a suggestion: the owner confirms with one tap (D43).

import type { BankTransaction, CostCategory, Expense, Invoice } from "@/lib/domain/types";
import { amountDue } from "@/lib/invoicing/status";
import { guessCategory } from "./categories";
import { daysBetween } from "./periods";

export type MatchSuggestion =
  | { kind: "invoice"; invoiceId: string }
  | { kind: "expense"; expenseId: string }
  | { kind: "new_expense"; category: CostCategory | null }
  | { kind: "counted" }
  | null;

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length >= 3);
const PAYOUT = /mollie|stripe|sumup|uitbetaling|payout|settlement/i;

/** Invoice numbers ("2026-0012") written in the bank description. */
function numbersIn(text: string): string[] {
  return text.match(/\b\d{4}-\d{4}\b/g) ?? [];
}

export function suggestMatch(tx: BankTransaction, ctx: { openInvoices: Invoice[]; unlinkedExpenses: Expense[] }): MatchSuggestion {
  if (tx.amountCents > 0) {
    const byNumber = ctx.openInvoices.find((i) => i.number && numbersIn(tx.description).includes(i.number));
    if (byNumber) return { kind: "invoice", invoiceId: byNumber.id };
    const sameAmount = ctx.openInvoices.filter((i) => amountDue(i) === tx.amountCents);
    const named = sameAmount.filter((i) => words(i.buyer.name).some((w) => words(tx.counterparty).includes(w)));
    const pick = named[0] ?? (sameAmount.length === 1 ? sameAmount[0] : undefined);
    if (pick) return { kind: "invoice", invoiceId: pick.id };
    if (PAYOUT.test(`${tx.counterparty} ${tx.description}`)) return { kind: "counted" };
    return null;
  }
  const candidates = ctx.unlinkedExpenses
    .filter((e) => e.grossCents === -tx.amountCents && Math.abs(daysBetween(e.date, tx.bookedOn)) <= 14)
    .sort((a, b) => Math.abs(daysBetween(a.date, tx.bookedOn)) - Math.abs(daysBetween(b.date, tx.bookedOn)));
  if (candidates[0]) return { kind: "expense", expenseId: candidates[0].id };
  return { kind: "new_expense", category: guessCategory(`${tx.counterparty} ${tx.description}`) };
}
