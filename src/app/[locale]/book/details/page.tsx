import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, Notice } from "@/design-system";
import { redirect } from "@/i18n/navigation";
import { getStore } from "@/lib/server/data";
import { getSession } from "@/lib/server/session";
import { AppointmentSummary } from "@/features/booking/components/AppointmentSummary";
import { CompactSummary } from "@/features/booking/components/CompactSummary";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { DetailsForm } from "@/features/booking/components/DetailsForm";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { loadPolicy } from "@/features/booking/server/catalog";
import { clientArea } from "@/features/booking/server/client-area";
import { asLocale, bookingMetadata, safeCatalog } from "@/features/booking/server/pages";
import { findSlotAt } from "@/features/booking/server/slots";
import { localDay, mondayOf } from "@/features/booking/time";
import type { DetailsValues } from "@/features/booking/validation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ st?: string; start?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "booking.details" });
  return bookingMetadata(locale, `${t("title")} | The Hague Natural Health Centre`);
}

/** Step 3: your details, the therapist's cancellation policy and health-data consent. Submitting holds the slot. */
export default async function BookDetailsPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { st, start } = await searchParams;
  const t = await getTranslations("booking.details");
  const catalog = await safeCatalog(locale);
  if (!catalog) return <BookingUnavailable />;
  const entry = st ? catalog.bySessionType.get(st) : undefined;
  if (!entry || !start || Number.isNaN(Date.parse(start))) redirect({ href: "/book", locale });
  const { item, therapist } = entry!;
  const startIso = new Date(start!).toISOString();
  const day = localDay(startIso);
  const timeHref = { pathname: "/book/time", query: { st: item.sessionTypeId, week: mondayOf(day), day } };

  const [slot, policy, session] = await Promise.all([
    findSlotAt(item.sessionTypeId, startIso).catch(() => null),
    loadPolicy(therapist.id).catch(() => null),
    getSession(),
  ]);

  let prefill: Partial<DetailsValues> | null = null;
  let signedInName: string | null = null;
  if (session?.role === "client") {
    signedInName = session.displayName;
    const me = await clientArea(getStore()).getMe?.(session).catch(() => null);
    if (me) prefill = { firstName: me.firstName, lastName: me.lastName, email: me.email, phone: me.phone };
  }

  const summaryData = {
    therapistName: therapist.displayName,
    therapistPhoto: therapist.photoUrl,
    serviceName: item.serviceName,
    sessionTypeName: item.sessionTypeName,
    durationMin: item.durationMin,
    priceCents: item.priceCents,
    depositCents: item.depositCents,
  };
  const tb = await getTranslations("booking");
  const summary = (
    <AppointmentSummary
      data={summaryData}
      start={startIso}
      footer={
        <ButtonLink href={timeHref} variant="ghost" size="sm" className="self-start">
          {tb("change")}
        </ButtonLink>
      }
    />
  );

  return (
    <BookingLayout step="details" back={timeHref} title={t("title")} intro={t("intro")} aside={<div className="hidden lg:block">{summary}</div>}>
      <CompactSummary data={summaryData} start={startIso} changeHref={timeHref} />
      {slot ? (
        <DetailsForm
          sessionTypeId={item.sessionTypeId}
          start={startIso}
          prefill={prefill}
          signedInName={signedInName}
          therapistName={therapist.displayName}
          policyText={policy?.text[locale] ?? null}
        />
      ) : (
        <Notice
          tone="warning"
          role="alert"
          title={t("slotGoneTitle")}
          action={<ButtonLink href={{ ...timeHref, query: { ...timeHref.query, taken: "1" } }}>{t("chooseAnother")}</ButtonLink>}
        >
          {t("slotGoneText")}
        </Notice>
      )}
    </BookingLayout>
  );
}
