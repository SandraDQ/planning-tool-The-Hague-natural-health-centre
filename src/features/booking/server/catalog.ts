import "server-only";
import { cache } from "react";
import { getStore } from "@/lib/server/data";
import type { CancellationPolicy, Id, Locale, Service, SessionType, Therapist, Therapy } from "@/lib/domain/types";
import { depositCents } from "../money";

/** One bookable thing on the menu: a session type with its service, therapy and therapist. */
export type MenuItem = {
  sessionTypeId: Id;
  serviceId: Id;
  therapyId: Id;
  therapistId: Id;
  therapistSlug: string;
  therapistName: string;
  serviceName: string;
  serviceDescription: string;
  sessionTypeName: string;
  therapyName: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
};

export type Catalog = {
  therapies: Therapy[];
  therapists: Therapist[];
  items: MenuItem[];
  bySessionType: Map<Id, { item: MenuItem; service: Service; sessionType: SessionType; therapist: Therapist }>;
};

/**
 * Everything bookable, loaded once per request. The catalogue is small
 * (a handful of therapists), so we read it whole rather than adding store methods.
 */
export const loadCatalog = cache(async (locale: Locale): Promise<Catalog> => {
  const store = getStore();
  const [therapies, therapists] = await Promise.all([store.public.listTherapies(), store.public.listBookableTherapists()]);
  const therapyById = new Map(therapies.map((t) => [t.id, t]));
  const items: MenuItem[] = [];
  const bySessionType: Catalog["bySessionType"] = new Map();

  for (const therapist of therapists) {
    const services = (await store.public.listServices(therapist.id)).filter((s) => !s.archived);
    for (const service of services) {
      const therapy = therapyById.get(service.therapyId);
      if (therapy && !therapy.active) continue;
      for (const sessionType of await store.public.listSessionTypes(service.id)) {
        const item: MenuItem = {
          sessionTypeId: sessionType.id,
          serviceId: service.id,
          therapyId: service.therapyId,
          therapistId: therapist.id,
          therapistSlug: therapist.slug,
          therapistName: therapist.displayName,
          serviceName: service.name[locale],
          serviceDescription: service.description[locale],
          sessionTypeName: sessionType.name[locale],
          therapyName: therapy?.name[locale] ?? service.name[locale],
          durationMin: sessionType.durationMin,
          priceCents: sessionType.priceCents,
          depositCents: depositCents(service, sessionType),
        };
        items.push(item);
        bySessionType.set(sessionType.id, { item, service, sessionType, therapist });
      }
    }
  }

  const offered = new Set(items.map((i) => i.therapyId));
  const withItems = new Set(items.map((i) => i.therapistId));
  return {
    therapies: therapies.filter((t) => t.active && offered.has(t.id)),
    therapists: therapists.filter((t) => withItems.has(t.id)),
    items,
    bySessionType,
  };
});

export const loadPolicy = cache(async (therapistId: Id): Promise<CancellationPolicy | null> => {
  return getStore().public.getCancellationPolicy(therapistId);
});

/** Therapist by id among the bookable ones (the public store has no lookup by id). */
export async function findTherapist(locale: Locale, therapistId: Id): Promise<Therapist | null> {
  const catalog = await loadCatalog(locale);
  return catalog.therapists.find((t) => t.id === therapistId) ?? null;
}
