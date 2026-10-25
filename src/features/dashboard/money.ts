// Money helpers: the store keeps integer cents; forms use euros.

export function formatEuro(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "12,50" or "12.50" → 1250. Returns null when not a valid non-negative amount. */
export function parseEuroInput(value: FormDataEntryValue | string | null | undefined): number | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** 1250 → "12.50" for an input's value. */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export const BTW_RATE: Record<"21" | "9" | "exempt", number> = { "21": 0.21, "9": 0.09, exempt: 0 };
