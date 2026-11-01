"use server";

import type { CancelResult } from "@/app/[locale]/account/actions";
import { readManageToken } from "@/lib/email/manage-link";
import { getStore } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";

/** Cancel from the signed link in the confirmation e-mail (no account needed). */
export async function cancelWithLinkAction(_prev: CancelResult, form: FormData): Promise<CancelResult> {
  const id = readManageToken(String(form.get("token") ?? ""));
  if (!id) return { status: "error" };
  try {
    const result = await getStore().booking.cancelWithLink(id);
    return { status: "done", refundCents: result.refundCents, feeCents: result.feeCents };
  } catch (e) {
    logSafeError("[manage] cancel by link failed", e);
    return { status: "error" };
  }
}
