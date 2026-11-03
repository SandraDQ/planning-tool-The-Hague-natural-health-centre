// Months and quarters as local dates ("YYYY-MM-DD"), for the overviews and the BTW quarter.

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-Q4" for any day in October–December 2026. */
export function quarterOf(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}

export function parseQuarter(raw: string | undefined | null): string | null {
  return raw && /^\d{4}-Q[1-4]$/.test(raw) ? raw : null;
}

/** First day of the quarter, first day after it, and the first day of each of its months. */
export function quarterBounds(quarter: string): { first: string; next: string; months: string[] } {
  const [y, q] = [Number(quarter.slice(0, 4)), Number(quarter.slice(6))];
  const m0 = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map((i) => `${y}-${pad(m0 + i)}-01`);
  const next = q === 4 ? `${y + 1}-01-01` : `${y}-${pad(m0 + 3)}-01`;
  return { first: months[0], next, months };
}

export function shiftQuarter(quarter: string, by: number): string {
  const index = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(6)) - 1 + by;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

/** The BTW return for a quarter is due on the last day of the month after it. */
export function filingDeadline(quarter: string): string {
  const { next } = quarterBounds(quarter);
  const [y, m] = next.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(last)}`;
}

/** Whole days between two local dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
