import type { CancellationPolicy } from "@/lib/domain/types";

const HOUR = 3_600_000;

/**
 * Latest moment a client can cancel for a full deposit refund (display only;
 * the store applies the real policy when cancelling). Business days skip
 * Saturday and Sunday; public holidays are not counted.
 */
export function freeCancelDeadline(start: string, policy: Pick<CancellationPolicy, "noticeValue" | "noticeUnit"> | null): number {
  const startMs = Date.parse(start);
  if (!policy) return startMs - 24 * HOUR;
  if (policy.noticeUnit === "hours") return startMs - policy.noticeValue * HOUR;
  let ms = startMs;
  let left = policy.noticeValue;
  while (left > 0) {
    ms -= 24 * HOUR;
    const wd = new Date(ms).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return ms;
}
