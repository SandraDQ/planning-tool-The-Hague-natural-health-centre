import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Invoice } from "@/lib/domain/types";
import { btwByRate, lineFromGross, lineFromNet, splitGross, totalsOf } from "./btw";
import { formatInvoiceNumber, invoiceYear } from "./numbering";
import { pdfSafe, renderInvoicePdf } from "./pdf";
import { amountDue, invoicePaymentStatus } from "./status";

describe("BTW arithmetic", () => {
  it("splits a price incl. BTW into net + BTW that add up exactly", () => {
    expect(splitGross(7500, "21")).toEqual({ netCents: 6198, btwCents: 1302 });
    expect(splitGross(6000, "9")).toEqual({ netCents: 5505, btwCents: 495 });
    expect(splitGross(6000, "exempt")).toEqual({ netCents: 6000, btwCents: 0 });
    for (let gross = 1; gross < 20_000; gross += 37) {
      for (const t of ["21", "9", "exempt"] as const) {
        const { netCents, btwCents } = splitGross(gross, t);
        expect(netCents + btwCents).toBe(gross);
      }
    }
  });

  it("builds deduction lines that mirror the original line", () => {
    const plus = lineFromGross("Deposit", 2500, "21", null);
    const minus = lineFromGross("Less deposit", -2500, "21", null);
    expect(minus.lineTotalCents).toBe(-plus.lineTotalCents);
    expect(minus.btwCents).toBe(-plus.btwCents);
    expect(totalsOf([plus, minus])).toEqual({ subtotalCents: 0, btwCents: 0, totalCents: 0 });
  });

  it("prices rent excl. BTW and only prints an exemption ground on exempt lines", () => {
    const rent = lineFromNet("Room 1", 3, 4000, "21", "ignored");
    expect(rent).toMatchObject({ lineTotalCents: 12000, btwCents: 2520, exemptionGround: null });
    const exempt = lineFromNet("Room 3", 1, 65000, "exempt", "art. 11");
    expect(exempt).toMatchObject({ btwCents: 0, btwRateBp: 0, exemptionGround: "art. 11" });
    expect(btwByRate([rent, exempt]).map((r) => r.treatment)).toEqual(["21", "exempt"]);
  });
});

describe("invoice numbers", () => {
  it("are YYYY-NNNN with the year in Amsterdam time", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("2026-0007");
    expect(invoiceYear("2026-12-31T23:30:00Z")).toBe(2027); // 00:30 on 1 January in Amsterdam
    expect(invoiceYear("2026-12-31T22:30:00Z")).toBe(2026);
  });
});

describe("payment status", () => {
  const inv = { kind: "final" as const, status: "issued" as const, totalCents: 5000, paidCents: 0, dueOn: "2026-11-10" };
  it("is open, overdue or paid", () => {
    expect(invoicePaymentStatus(inv, "2026-11-10")).toBe("open");
    expect(invoicePaymentStatus(inv, "2026-11-11")).toBe("overdue");
    expect(invoicePaymentStatus({ ...inv, paidCents: 5000 }, "2026-12-01")).toBe("paid");
    expect(invoicePaymentStatus({ ...inv, status: "draft" }, "2026-12-01")).toBe("draft");
    expect(invoicePaymentStatus({ ...inv, kind: "credit_note", totalCents: -500 }, "2026-12-01")).toBe("credit");
    expect(amountDue({ ...inv, paidCents: 2000 })).toBe(3000);
  });
});

describe("invoice PDF", () => {
  it("replaces characters the standard fonts cannot draw", () => {
    expect(pdfSafe("Café – €12,50 ✓ 漢")).toBe("Café – €12,50 ? ?");
    expect(pdfSafe("€ 12,50")).toBe("€ 12,50");
  });

  it("renders a valid one-page PDF", async () => {
    const lines = [lineFromGross("Acupunctuur – Vervolgbehandeling, 2 november 2026 10:00 (60 min)", 7500, "21", null), lineFromGross("Af: aanbetaling, factuur 2026-0001", -2500, "21", null)];
    const invoice: Invoice = {
      id: "inv-1",
      sellerType: "therapist",
      sellerTherapistId: "th-anna",
      kind: "final",
      status: "issued",
      number: "2026-0002",
      issuedAt: "2026-11-02T10:00:00Z",
      dueOn: "2026-11-16",
      locale: "nl",
      appointmentId: "a1",
      creditedInvoiceId: null,
      rentMonth: null,
      buyerClientId: "c1",
      buyerTherapistId: null,
      seller: { name: "Demo Praktijk Anna (Demo – Anna de Vries)", address: "Voorbeeldstraat 1", email: "anna@example.invalid", kvk: "90000001", btwNumber: "NL000000001B01" },
      buyer: { name: "Lotte Willems", address: null, email: "lotte@example.invalid" },
      lines,
      notes: ["Graag betalen vóór 16 november 2026."],
      ...totalsOf(lines),
      paidCents: 0,
      paidOn: null,
      sentAt: null,
      sentTo: null,
    };
    const bytes = await renderInvoicePdf(invoice, { demo: true });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Factuur 2026-0002");
  });
});
