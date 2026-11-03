// Invoice numbers "YYYY-NNNN", gap-free per seller per calendar year in Europe/Amsterdam (D13).

const YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric" });

export function invoiceYear(at: string | number | Date): number {
  return Number(YEAR.format(new Date(at)));
}

export function formatInvoiceNumber(year: number, n: number): string {
  return `${year}-${String(n).padStart(4, "0")}`;
}

/** Key of a seller's sequence: the centre, or one therapist. */
export function sequenceKey(sellerType: "therapist" | "centre", sellerTherapistId: string | null, year: number): string {
  return `${sellerType}:${sellerTherapistId ?? "centre"}:${year}`;
}
