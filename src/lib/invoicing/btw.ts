// BTW (Dutch VAT) arithmetic on integer cents. Rates are basis points (2100 = 21%).
// Client prices include BTW, so client invoice lines are built from the gross amount;
// room rent is priced excl. BTW, so rent lines are built from the net amount.

import type { BtwTreatment, InvoiceLine } from "@/lib/domain/types";

export const BTW_BP: Record<BtwTreatment, number> = { "21": 2100, "9": 900, exempt: 0 };

/** Splits a price incl. BTW into net + BTW. net + btw always equals gross exactly. */
export function splitGross(grossCents: number, treatment: BtwTreatment): { netCents: number; btwCents: number } {
  const bp = BTW_BP[treatment];
  const netCents = Math.round((grossCents * 10_000) / (10_000 + bp));
  return { netCents, btwCents: grossCents - netCents };
}

/** One line whose total incl. BTW is exactly `grossCents` (may be negative for deductions). */
export function lineFromGross(description: string, grossCents: number, treatment: BtwTreatment, exemptionGround: string | null): InvoiceLine {
  const sign = grossCents < 0 ? -1 : 1;
  const { netCents, btwCents } = splitGross(Math.abs(grossCents), treatment);
  return {
    description,
    quantity: 1,
    unitCents: sign * netCents,
    lineTotalCents: sign * netCents,
    btwTreatment: treatment,
    btwRateBp: BTW_BP[treatment],
    btwCents: sign * btwCents,
    exemptionGround: treatment === "exempt" ? exemptionGround : null,
  };
}

/** One line priced excl. BTW: quantity × unit, BTW on the line total. */
export function lineFromNet(
  description: string,
  quantity: number,
  unitCents: number,
  treatment: BtwTreatment,
  exemptionGround: string | null,
): InvoiceLine {
  const lineTotalCents = quantity * unitCents;
  return {
    description,
    quantity,
    unitCents,
    lineTotalCents,
    btwTreatment: treatment,
    btwRateBp: BTW_BP[treatment],
    btwCents: Math.round((lineTotalCents * BTW_BP[treatment]) / 10_000),
    exemptionGround: treatment === "exempt" ? exemptionGround : null,
  };
}

export function totalsOf(lines: InvoiceLine[]): { subtotalCents: number; btwCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((n, l) => n + l.lineTotalCents, 0);
  const btwCents = lines.reduce((n, l) => n + l.btwCents, 0);
  return { subtotalCents, btwCents, totalCents: subtotalCents + btwCents };
}

/** BTW per rate, for the totals block and the quarterly overview. */
export function btwByRate(lines: InvoiceLine[]): Array<{ treatment: BtwTreatment; netCents: number; btwCents: number }> {
  const map = new Map<BtwTreatment, { treatment: BtwTreatment; netCents: number; btwCents: number }>();
  for (const l of lines) {
    const row = map.get(l.btwTreatment) ?? { treatment: l.btwTreatment, netCents: 0, btwCents: 0 };
    row.netCents += l.lineTotalCents;
    row.btwCents += l.btwCents;
    map.set(l.btwTreatment, row);
  }
  const order: BtwTreatment[] = ["21", "9", "exempt"];
  return order.flatMap((t) => (map.has(t) ? [map.get(t)!] : []));
}
