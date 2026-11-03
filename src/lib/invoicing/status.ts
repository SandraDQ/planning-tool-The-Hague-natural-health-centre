// Payment status of an invoice, for "who has paid / who still owes" lists.

import type { Invoice, InvoicePaymentStatus } from "@/lib/domain/types";

/** What is still to be paid on an invoice (never negative). */
export function amountDue(inv: Pick<Invoice, "kind" | "totalCents" | "paidCents" | "status">): number {
  if (inv.status !== "issued" || inv.kind === "credit_note") return 0;
  return Math.max(0, inv.totalCents - inv.paidCents);
}

/** `today` is the local date (YYYY-MM-DD, Europe/Amsterdam). */
export function invoicePaymentStatus(inv: Pick<Invoice, "kind" | "totalCents" | "paidCents" | "status" | "dueOn">, today: string): InvoicePaymentStatus {
  if (inv.status === "draft") return "draft";
  if (inv.kind === "credit_note") return "credit";
  if (amountDue(inv) === 0) return "paid";
  if (inv.dueOn && inv.dueOn < today) return "overdue";
  return "open";
}
