"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { DomainError } from "@/lib/domain/store";
import type { CentreEmailSettings, Id, Locale } from "@/lib/domain/types";
import { sendExampleConfirmation } from "@/lib/email/notify";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { run } from "./run";

// Confirmation e-mail texts: therapists write their own message, the admin writes the
// centre's practical information and can send an example to check how it arrives.

export async function saveConfirmationMessage(input: { serviceId: Id | null; body: Record<Locale, string> }) {
  const session = await requireRole("therapist", await getLocale());
  const result = await run(() => getStore().email.setMyTemplate(session, input));
  revalidatePath("/[locale]/therapist/settings/emails", "page");
  return result;
}

export async function removeConfirmationMessage(serviceId: Id) {
  const session = await requireRole("therapist", await getLocale());
  const result = await run(() => getStore().email.deleteMyTemplate(session, serviceId).then(() => null));
  revalidatePath("/[locale]/therapist/settings/emails", "page");
  return result;
}

export async function saveCentreEmailInfo(settings: CentreEmailSettings) {
  const session = await requireRole("admin", await getLocale());
  const result = await run(() => getStore().email.setCentreSettings(session, settings));
  revalidatePath("/[locale]/admin/emails", "page");
  return result;
}

export async function sendExampleEmail(input: { to: string; locale: Locale }) {
  const session = await requireRole("admin", await getLocale());
  const store = getStore();
  const result = await run(async () => {
    const to = typeof input?.to === "string" ? input.to.trim() : "";
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to) || to.length > 254) throw new DomainError("invalid", "E-mail address");
    const locale: Locale = input.locale === "en" ? "en" : "nl";
    const centre = await store.email.getCentreSettings(session);
    try {
      return await sendExampleConfirmation({ to, locale, therapistName: locale === "nl" ? "je therapeut" : "your therapist", centre });
    } catch {
      throw new DomainError("invalid", "send_failed");
    }
  });
  revalidatePath("/[locale]/admin/emails", "page");
  return result;
}
