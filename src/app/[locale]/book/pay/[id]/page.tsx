import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, ButtonLink, Card, Icons, Notice } from "@/design-system";
import { redirect } from "@/i18n/navigation";
import { getStore } from "@/lib/server/data";
import { AppointmentSummary } from "@/features/booking/components/AppointmentSummary";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { CompactSummary } from "@/features/booking/components/CompactSummary";
import { FocusOnMount } from "@/features/booking/components/FocusOnMount";
import { PayActions } from "@/features/booking/components/PayActions";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { findTherapist } from "@/features/booking/server/catalog";
import { ownsBooking } from "@/features/booking/server/ownership";
import { asLocale, bookingMetadata } from "@/features/booking/server/pages";
import { localDay, mondayOf } from "@/features/booking/time";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ status?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "booking.pay" });
  return bookingMetadata(locale, `${t("title")} | The Hague Natural Health Centre`);
}

/** Step 4: the demo payment page (D23). Stands in for Mollie's hosted iDEAL checkout. */
export default async function BookPayPage({ params, searchParams }: Props) {
  const { locale: raw, id } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations("booking.pay");
  const format = await getFormatter();

  let appointment;
  try {
    appointment = await getStore().booking.getAppointment(id);
  } catch {
    return <BookingUnavailable />;
  }
  if (!appointment || !(await ownsBooking(appointment))) notFound();
  if (appointment.status === "confirmed" || appointment.status === "completed") redirect({ href: `/book/confirmed/${id}`, locale });

  const therapist = await findTherapist(locale, appointment.therapistId).catch(() => null);
  const s = appointment.snapshot;
  const data = {
    therapistName: therapist?.displayName ?? "",
    therapistPhoto: therapist?.photoUrl,
    serviceName: s.serviceName[locale],
    sessionTypeName: s.sessionTypeName[locale],
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    depositCents: s.depositCents,
  };
  const now = Date.now();
  const held = appointment.status === "held" && !!appointment.holdExpiresAt && Date.parse(appointment.holdExpiresAt) > now;
  const day = localDay(appointment.session.start);
  const chooseAgainHref = `/book/time?st=${encodeURIComponent(appointment.sessionTypeId)}&week=${mondayOf(day)}&day=${day}`;
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  const outcome =
    status === "failed"
      ? { tone: "danger" as const, title: t("failedTitle"), text: held ? t("failedText") : t("failedReleasedText") }
      : status === "abandoned"
        ? { tone: "warning" as const, title: t("abandonedTitle"), text: t("abandonedText") }
        : status === "error"
          ? { tone: "danger" as const, title: t("errorTitle"), text: t("errorText") }
          : null;

  return (
    <BookingLayout
      step="pay"
      title={t("title")}
      intro={t("intro")}
      aside={
        <div className="hidden lg:block">
          <AppointmentSummary data={data} start={appointment.session.start} showNotes={false} />
        </div>
      }
    >
      <CompactSummary data={data} start={appointment.session.start} />

      {outcome && held && (
        <FocusOnMount>
          <Notice tone={outcome.tone} role="alert" title={outcome.title}>
            {outcome.text}
          </Notice>
        </FocusOnMount>
      )}

      {held ? (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Badge tone="warning" icon={<Icons.Info />} className="self-start whitespace-normal">
              {t("demoBadge")}
            </Badge>
            <p className="text-sm text-fg-muted">{t("demoText")}</p>
          </div>
          <dl className="flex items-baseline justify-between gap-4 border-y border-border py-4">
            <dt className="text-base">{t("amount")}</dt>
            <dd className="font-heading text-xl tabular-nums">{euro(s.depositCents)}</dd>
          </dl>
          <PayActions appointmentId={appointment.id} holdExpiresAt={appointment.holdExpiresAt!} serverNow={now} chooseAgainHref={chooseAgainHref} />
        </Card>
      ) : (
        <FocusOnMount>
          <Notice
            tone="warning"
            role="alert"
            title={status === "failed" ? t("failedTitle") : t("expiredTitle")}
            action={<ButtonLink href={chooseAgainHref}>{t("chooseAgain")}</ButtonLink>}
          >
            {status === "failed" ? t("failedReleasedText") : t("expiredText")}
          </Notice>
        </FocusOnMount>
      )}
    </BookingLayout>
  );
}
