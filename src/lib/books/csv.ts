// Spreadsheet export as CSV that opens straight in Excel / Numbers: Dutch files use ";"
// and a decimal comma, English files "," and a decimal point. A BOM keeps é and € intact.

export type CsvCell = string | number | null;

export interface CsvFormat {
  separator: ";" | ",";
  decimal: "," | ".";
}

export const csvFormatFor = (locale: "nl" | "en"): CsvFormat => (locale === "nl" ? { separator: ";", decimal: "," } : { separator: ",", decimal: "." });

/** Cents → "12,50" / "12.50" (no currency sign, so spreadsheets read it as a number). */
export const csvAmount = (cents: number, f: CsvFormat) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}${f.decimal}${String(abs % 100).padStart(2, "0")}`;
};

function cell(value: CsvCell, f: CsvFormat): string {
  if (value === null) return "";
  let s = String(value);
  // Text that a spreadsheet would run as a formula is made inert (CSV injection).
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /["\n\r]/.test(s) || s.includes(f.separator) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][], f: CsvFormat): string {
  return "﻿" + rows.map((r) => r.map((c) => cell(c, f)).join(f.separator)).join("\r\n") + "\r\n";
}
