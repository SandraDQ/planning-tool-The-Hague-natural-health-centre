import { describe, expect, it } from "vitest";
import type { BankTransaction, Expense, Invoice } from "@/lib/domain/types";
import { guessCategory } from "./categories";
import { csvAmount, csvFormatFor, toCsv } from "./csv";
import { demoReceiptPdf } from "./demo-receipt";
import { suggestMatch } from "./matching";
import { filingDeadline, quarterBounds, quarterOf, shiftQuarter } from "./periods";
import { safeFileName, sniffReceipt } from "./receipt-file";
import { btwQuarter, periodTotals } from "./summary";
import { buildZip, crc32 } from "./zip";

const expense = (over: Partial<Expense>): Expense => ({
  id: "e1",
  ownerTherapistId: null,
  date: "2026-10-05",
  supplier: "Eneco",
  description: "",
  category: "energy",
  grossCents: 12100,
  btwRate: "21",
  netCents: 10000,
  btwCents: 2100,
  receipt: null,
  bankTransactionId: null,
  createdAt: "2026-10-05T10:00:00Z",
  ...over,
});

const tx = (over: Partial<BankTransaction>): BankTransaction => ({
  id: "t1",
  ownerTherapistId: null,
  bookedOn: "2026-10-06",
  amountCents: -12100,
  counterparty: "Eneco",
  counterpartyIban: null,
  description: "Termijn",
  match: null,
  ...over,
});

const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: "i1",
    status: "issued",
    kind: "final",
    number: "2026-0012",
    issuedAt: "2026-10-10T09:00:00Z",
    buyer: { name: "Lotte Willems", address: "", email: null },
    lines: [{ description: "x", quantity: 1, unitCents: 10000, lineTotalCents: 10000, btwTreatment: "21", btwRateBp: 2100, btwCents: 2100, exemptionGround: null }],
    subtotalCents: 10000,
    btwCents: 2100,
    totalCents: 12100,
    paidCents: 0,
    paidOn: null,
    ...over,
  }) as Invoice;

const dayOf = (iso: string) => iso.slice(0, 10);

describe("bookkeeping logic", () => {
  it("knows quarters and the filing deadline", () => {
    expect(quarterOf("2026-11-01")).toBe("2026-Q4");
    expect(quarterBounds("2026-Q4")).toEqual({ first: "2026-10-01", next: "2027-01-01", months: ["2026-10-01", "2026-11-01", "2026-12-01"] });
    expect(shiftQuarter("2026-Q1", -1)).toBe("2025-Q4");
    expect(shiftQuarter("2026-Q4", 1)).toBe("2027-Q1");
    expect(filingDeadline("2026-Q4")).toBe("2027-01-31");
    expect(filingDeadline("2026-Q1")).toBe("2026-04-30");
  });

  it("adds up a month and the BTW quarter; KOR/exempt owners count costs incl. BTW", () => {
    const input = { invoices: [invoice({})], expenses: [expense({}), expense({ id: "e2", category: "bank_fees", grossCents: 900, netCents: 900, btwCents: 0, btwRate: "exempt" })], transactions: [tx({ amountCents: 4500, match: { kind: "other_income" } })], deductsBtw: true, dayOf };
    const m = periodTotals(input, "2026-10-01", "2026-11-01");
    expect(m).toMatchObject({ invoicedNetCents: 10000, otherIncomeCents: 4500, costsCents: 10900, resultCents: 3600, stillToReceiveCents: 12100, missingReceipts: 1 });
    expect(periodTotals({ ...input, deductsBtw: false }, "2026-10-01", "2026-11-01").costsCents).toBe(13000);
    const q = btwQuarter(input, "2026-10-01", "2027-01-01");
    expect(q.sales["21"]).toEqual({ netCents: 10000, btwCents: 2100 });
    expect(q.inputBtwCents).toBe(2100);
    expect(q.balanceCents).toBe(0);
    expect(btwQuarter({ ...input, deductsBtw: false }, "2026-10-01", "2027-01-01").inputBtwCents).toBe(0);
  });

  it("suggests the invoice by number or amount + name, the cost by amount and date, payouts as counted", () => {
    const open = [invoice({}), invoice({ id: "i2", number: "2026-0013", buyer: { name: "Gijs Mulder", address: "", email: null } })];
    expect(suggestMatch(tx({ amountCents: 500, description: "Betaling factuur 2026-0013" }), { openInvoices: open, unlinkedExpenses: [] })).toEqual({ kind: "invoice", invoiceId: "i2" });
    expect(suggestMatch(tx({ amountCents: 12100, counterparty: "L. Willems", description: "x" }), { openInvoices: open, unlinkedExpenses: [] })).toEqual({ kind: "invoice", invoiceId: "i1" });
    expect(suggestMatch(tx({ amountCents: 9000, counterparty: "Stichting Mollie Payments", description: "Uitbetaling" }), { openInvoices: open, unlinkedExpenses: [] })).toEqual({ kind: "counted" });
    expect(suggestMatch(tx({ amountCents: 9000, counterparty: "P. de Wit" }), { openInvoices: open, unlinkedExpenses: [] })).toBeNull();
    expect(suggestMatch(tx({}), { openInvoices: [], unlinkedExpenses: [expense({})] })).toEqual({ kind: "expense", expenseId: "e1" });
    expect(suggestMatch(tx({ bookedOn: "2026-11-30" }), { openInvoices: [], unlinkedExpenses: [expense({})] })).toEqual({ kind: "new_expense", category: "energy" });
    expect(guessCategory("bol.com bestelling")).toBe("supplies");
    expect(guessCategory("Mevrouw Jansen")).toBeNull();
  });

  it("accepts only real photos and PDFs, with safe file names", () => {
    expect(sniffReceipt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceipt(demoReceiptPdf(["Shop", "Totaal 1,00"]))).toBe("application/pdf");
    expect(sniffReceipt(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(safeFileName("../../etc/passwd", "pdf")).toBe("etcpasswd.pdf");
    expect(safeFileName("Bon Hema 3 okt.JPG", "jpg")).toBe("Bon-Hema-3-okt.jpg");
  });

  it("writes CSV for Dutch and English spreadsheets, and makes formulas inert", () => {
    const nl = csvFormatFor("nl");
    expect(csvAmount(-1234, nl)).toBe("-12,34");
    expect(csvAmount(5, csvFormatFor("en"))).toBe("0.05");
    const out = toCsv([["=HYPERLINK(1)", "-12,34", "a;b", 'say "hi"']], nl);
    expect(out).toBe('﻿\'=HYPERLINK(1);-12,34;"a;b";"say ""hi"""\r\n');
  });

  it("builds a valid zip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const zip = buildZip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "receipts/b.pdf", data: demoReceiptPdf(["x"]) }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });
});
