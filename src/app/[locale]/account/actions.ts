"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/domain/types";
import { getStore } from "@/lib/server/data";
import { getSession } from "@/lib/server/session";

export type CancelResult =
  | { status: "idle" }
  | { status: "done"; refundCents: number; feeCents: number }
  | { status: "error" };

function asLocale(x: string): Locale {
  return (routing.locales as readonly string[]).includes(x) ? (x as Locale) : routing.defaultLocale;
}

/** Client area: cancel one of my own appointments; returns what happens to the deposit. */
export async function cancelOwnAppointment(_prev: CancelResult, form: FormData): Promise<CancelResult> {
  const locale = asLocale(String(form.get("locale") ?? ""));
  const id = String(form.get("id") ?? "");
  const session = await getSession();
  if (!session || session.role !== "client") redirect({ href: "/login", locale });
  try {
    // The store checks the appointment belongs to this client and applies the therapist's policy.
    const result = await getStore().client.cancelAppointment(session!, id, "client");
    revalidatePath(`/${locale}/account`);
    return { status: "done", refundCents: result.refundCents, feeCents: result.feeCents };
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    console.error("[account] client cancel failed", typeof code === "string" ? code : "unknown");
    return { status: "error" };
  }
}
