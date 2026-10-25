// The therapist's cancellation policy applied to a client cancellation (pure).

import type { CancellationPolicy, Iso } from "@/lib/domain/types";
import { utcToLocal } from "@/lib/scheduling";
import { addDays, isoWeekday, iso, localToUtcIso, ms } from "./time";

/**
 * Last moment to cancel for free. "hours": start minus N hours. "business_days": the same
 * local time N working days (Mon–Fri) earlier. Public holidays are not counted yet.
 */
export function freeCancellationDeadline(policy: Pick<CancellationPolicy, "noticeValue" | "noticeUnit">, sessionStart: Iso): Iso {
  if (policy.noticeUnit === "hours") return iso(ms(sessionStart) - policy.noticeValue * 3_600_000);
  const local = utcToLocal(sessionStart);
  let date = local.date;
  for (let left = policy.noticeValue; left > 0; ) {
    date = addDays(date, -1);
    if (isoWeekday(date) <= 5) left--;
  }
  return localToUtcIso(date, local.time);
}

export function cancellationTerms(input: {
  policy: CancellationPolicy | null;
  sessionStart: Iso;
  priceCents: number;
  depositPaidCents: number;
  newClient: boolean;
  nowMs: number;
}): { onTime: boolean; freeUntil: Iso | null; feeCents: number; refundCents: number } {
  const { policy, depositPaidCents } = input;
  if (!policy) return { onTime: true, freeUntil: null, feeCents: 0, refundCents: depositPaidCents };
  const freeUntil = freeCancellationDeadline(policy, input.sessionStart);
  const inTime = input.nowMs <= ms(freeUntil);
  const exempt = policy.exemptNewClients && input.newClient;
  if (inTime || exempt) return { onTime: true, freeUntil, feeCents: 0, refundCents: depositPaidCents };
  const fee = policy.feeType === "percent" ? Math.round((input.priceCents * policy.feeValue) / 100) : policy.feeValue;
  const feeCents = Math.min(Math.max(fee, 0), depositPaidCents); // the fee is kept from the deposit only
  return { onTime: false, freeUntil, feeCents, refundCents: depositPaidCents - feeCents };
}
