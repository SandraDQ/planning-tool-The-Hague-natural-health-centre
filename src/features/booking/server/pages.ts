import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/domain/types";
import { loadCatalog, type Catalog } from "./catalog";
import type { MenuEntry, MenuTherapist, MenuTherapy } from "../components/ServiceMenu";

export function asLocale(x: string): Locale {
  return (routing.locales as readonly string[]).includes(x) ? (x as Locale) : routing.defaultLocale;
}

export async function bookingMetadata(locale: Locale, title?: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "booking" });
  return {
    title: { absolute: title ?? t("metaTitle") },
    description: t("metaDescription"),
    robots: { index: false, follow: true },
  };
}

/** The catalogue, or null when the data layer is not reachable (shows a friendly notice). */
export async function safeCatalog(locale: Locale): Promise<Catalog | null> {
  try {
    return await loadCatalog(locale);
  } catch (err) {
    console.error("[booking] catalogue unavailable", (err as Error)?.message);
    return null;
  }
}

export function menuData(catalog: Catalog, locale: Locale, filter: { therapistId?: string; therapyId?: string } = {}) {
  const entries: MenuEntry[] = catalog.items
    .filter((i) => (!filter.therapistId || i.therapistId === filter.therapistId) && (!filter.therapyId || i.therapyId === filter.therapyId))
    .map((i) => ({
      sessionTypeId: i.sessionTypeId,
      therapyId: i.therapyId,
      therapistId: i.therapistId,
      therapistName: i.therapistName,
      serviceName: i.serviceName,
      sessionTypeName: i.sessionTypeName,
      therapyName: i.therapyName,
      durationMin: i.durationMin,
      priceCents: i.priceCents,
      depositCents: i.depositCents,
    }));
  const therapyName = new Map(catalog.therapies.map((t) => [t.id, t.name[locale]]));
  const therapists: MenuTherapist[] = catalog.therapists.map((t) => ({
    id: t.id,
    name: t.displayName,
    photoUrl: t.photoUrl,
    bio: t.bio[locale],
    therapies: [...new Set(catalog.items.filter((i) => i.therapistId === t.id).map((i) => therapyName.get(i.therapyId) ?? i.therapyName))].join(" · "),
  }));
  const therapies: MenuTherapy[] = catalog.therapies.map((t) => ({ id: t.id, name: t.name[locale] }));
  return { entries, therapists, therapies };
}
