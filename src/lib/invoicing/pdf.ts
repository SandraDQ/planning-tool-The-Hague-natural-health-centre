// Renders an issued invoice as an A4 PDF (pdf-lib, standard fonts, no files on disk).
// Shows everything Dutch law asks for (9.3): seller name/address/KvK/BTW number, buyer,
// number, date, description, amounts excl. BTW, BTW per rate or the exemption ground, total.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Invoice } from "@/lib/domain/types";
import { btwByRate } from "./btw";
import { INVOICE_TEXT, euro, longDate, rateLabel } from "./text";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.82, 0.82, 0.82);

// Characters the standard fonts (WinAnsi) can draw beyond Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Replaces anything the standard PDF fonts cannot draw. */
export function pdfSafe(text: string): string {
  return [...text.normalize("NFC")]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (ch === " " || ch === " ") return " "; // Intl uses (narrow) no-break spaces
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch;
      return "?";
    })
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderInvoicePdf(invoice: Invoice, options: { demo?: boolean } = {}): Promise<Uint8Array> {
  const text = INVOICE_TEXT[invoice.locale];
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${text.title[invoice.kind]} ${invoice.number ?? ""}`.trim()));
  doc.setAuthor(pdfSafe(invoice.seller.name));
  doc.setCreator("THNHC platform");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const draw = (s: string, x: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const safe = pdfSafe(s);
    const dx = opts.right ? x - font.widthOfTextAtSize(safe, size) : x;
    page.drawText(safe, { x: dx, y, size, font, color: opts.color ?? INK });
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };
  const rule = () => {
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: A4.width - MARGIN, y: y + 4 }, thickness: 0.6, color: RULE });
  };

  // Seller (left) and title block (right).
  const right = A4.width - MARGIN;
  const top = y;
  draw(invoice.seller.name, MARGIN, { size: 13, font: bold });
  y -= 16;
  for (const l of [
    invoice.seller.address,
    invoice.seller.email,
    invoice.seller.kvk ? `${text.kvk}: ${invoice.seller.kvk}` : null,
    invoice.seller.btwNumber ? `${text.btwNumber}: ${invoice.seller.btwNumber}` : null,
  ]) {
    if (!l) continue;
    draw(l, MARGIN, { color: MUTED });
    y -= 13;
  }
  const afterSeller = y;
  y = top;
  draw(text.title[invoice.kind], right, { size: 18, font: bold, right: true });
  y -= 22;
  for (const [label, value] of [
    [text.number, invoice.number ?? "—"],
    [text.date, invoice.issuedAt ? longDate(invoice.issuedAt, invoice.locale) : "—"],
    ...(invoice.dueOn && invoice.kind !== "credit_note" ? [[text.due, longDate(invoice.dueOn, invoice.locale)]] : []),
  ] as Array<[string, string]>) {
    draw(`${label}: ${value}`, right, { right: true });
    y -= 13;
  }
  y = Math.min(afterSeller, y) - 18;

  // Buyer.
  draw(text.to, MARGIN, { color: MUTED, size: 9 });
  y -= 13;
  draw(invoice.buyer.name, MARGIN, { font: bold, size: 11 });
  y -= 14;
  for (const l of [invoice.buyer.address, invoice.buyer.email, invoice.buyer.kvk ? `${text.kvk}: ${invoice.buyer.kvk}` : null]) {
    if (!l) continue;
    draw(l, MARGIN, { color: MUTED });
    y -= 13;
  }
  y -= 18;

  // Lines.
  const col = { desc: MARGIN, qty: 330, unit: 400, btw: 450, amount: right };
  const header = () => {
    draw(text.description, col.desc, { font: bold, size: 9 });
    draw(text.quantity, col.qty, { font: bold, size: 9, right: true });
    draw(text.unit, col.unit, { font: bold, size: 9, right: true });
    draw(text.btw, col.btw, { font: bold, size: 9, right: true });
    draw(text.amount, col.amount, { font: bold, size: 9, right: true });
    y -= 8;
    rule();
    y -= 12;
  };
  header();
  for (const line of invoice.lines) {
    const descLines = wrap(line.description, regular, 10, col.qty - col.desc - 40);
    ensure(descLines.length * 13 + 6);
    draw(String(line.quantity), col.qty, { right: true });
    draw(euro(line.unitCents, invoice.locale), col.unit, { right: true });
    draw(line.btwTreatment === "exempt" ? text.exempt : rateLabel(line.btwRateBp), col.btw, { right: true });
    draw(euro(line.lineTotalCents, invoice.locale), col.amount, { right: true });
    for (const d of descLines) {
      draw(d, col.desc);
      y -= 13;
    }
    y -= 4;
  }
  rule();
  y -= 12;

  // Totals.
  ensure(80);
  const totalRow = (label: string, cents: number, strong = false) => {
    draw(label, col.btw, { right: true, font: strong ? bold : regular, size: strong ? 11 : 10 });
    draw(euro(cents, invoice.locale), col.amount, { right: true, font: strong ? bold : regular, size: strong ? 11 : 10 });
    y -= strong ? 16 : 13;
  };
  totalRow(text.subtotal, invoice.subtotalCents);
  for (const r of btwByRate(invoice.lines)) {
    if (r.treatment === "exempt") continue;
    totalRow(text.btwLine(rateLabel(r.treatment === "21" ? 2100 : 900)), r.btwCents);
  }
  totalRow(text.total, invoice.totalCents, true);
  const due = invoice.kind === "credit_note" ? 0 : Math.max(0, invoice.totalCents - invoice.paidCents);
  if (invoice.kind !== "credit_note" && invoice.paidCents > 0 && due > 0) totalRow(text.totalDue, due, true);
  y -= 10;

  // Exemption grounds and notes.
  const grounds = [...new Set(invoice.lines.filter((l) => l.btwTreatment === "exempt" && l.exemptionGround).map((l) => l.exemptionGround!))];
  for (const para of [...grounds.map((g) => text.exemptNote(g)), ...invoice.notes]) {
    const ls = wrap(para, regular, 10, A4.width - 2 * MARGIN);
    ensure(ls.length * 13 + 4);
    for (const l of ls) {
      draw(l, MARGIN);
      y -= 13;
    }
    y -= 4;
  }

  if (options.demo) {
    for (const p of doc.getPages()) {
      const label = pdfSafe(text.demo);
      p.drawText(label, { x: MARGIN, y: MARGIN - 10, size: 9, font: bold, color: rgb(0.7, 0.2, 0.1) });
    }
  }
  return doc.save();
}
