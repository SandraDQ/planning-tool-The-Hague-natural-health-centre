import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Notice, siteContact } from "@/design-system";
import { CancelAppointment } from "@/features/booking/components/CancelAppointment";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { findTherapist, loadPolicy } from "@/features/booking/server/catalog";
import { asLocale, bookingMetadata } from "@/features/booking/server/pages";
import { freeCancelDeadline } from "@/features/booking/policy";
import { TIME_ZONE } from "@/features/booking/time";
import { readManageToken } from "@/lib/email/manage-link";
import { getStore } from "@/lib/server/data";
import { cancelWithLinkAction } from "./actions";

type Props = { params: Promise<{ locale: string; token: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "email.manage" });
  return { ...(await bookingMetadata(locale, `${t("title")} | The Hague Natural Health Centre`)), robots: { index: false, follow: false } };
}

/** Opened from the confirmation e-mail: see the appointment and cancel it, no account needed. */
export default async function ManageBookingPage({ params }: Props) {
  const { locale: raw, token } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const id = readManageToken(token);
  if (!id) notFound();
  const t = await getTranslations("email.manage");
  const ta = await getTranslations("booking.account");
  const format = await getFormatter();

  let appointment;
  try {
    appointment = await getStore().booking.getAppointment(id);
  } catch {
    return <BookingUnavailable />;
  }
  if (!appointment) notFound();
  const [therapist, policy] = await Promise.all([
    findTherapist(locale, appointment.therapistId).catch(() => null),
    loadPolicy(appointment.therapistId).catch(() => null),
  ]);
  const name = therapist?.displayName ?? "";
  const s = appointment.snapshot;
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const when = format.dateTime(new Date(appointment.session.start), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  });
  const now = Date.now();
  const started = Date.parse(appointment.session.start) <= now;
  const paid = appointment.source === "online" ? s.depositCents : 0;
  const consequence = !paid
    ? t("cancelNoDeposit")
    : now <= freeCancelDeadline(appointment.session.start, policy)
      ? ta("cancelOnTime", { deposit: euro(paid) })
      : ta("cancelLate", {
          notice: policy ? (policy.noticeUnit === "hours" ? ta("noticeHours", { n: policy.noticeValue }) : ta("noticeDays", { n: policy.noticeValue })) : ta("noticeHours", { n: 24 }),
          name,
        });

  return (
    <div className="mx-auto max-w-2xl px-gutter pt-10 pb-16 sm:pt-14">
      <h1 className="text-xl">{t("title")}</h1>
      <p className="mt-2 text-base text-fg-muted">{t("lead")}</p>
      <Card as="section" aria-labelledby="appt-title" className="mt-6 flex flex-col gap-3">
        <h2 id="appt-title" className="text-lg first-letter:uppercase">
          {when}
        </h2>
        <p className="text-base">
          {[s.serviceName[locale], s.sessionTypeName[locale] !== s.serviceName[locale] ? s.sessionTypeName[locale] : null].filter(Boolean).join(" · ")}
        </p>
        {name && <p className="text-base text-fg-muted first-letter:uppercase">{ta("with", { name })}</p>}

        {appointment.status === "cancelled" ? (
          <Notice title={t("alreadyCancelled")} />
        ) : appointment.status !== "confirmed" || started ? (
          <Notice title={t("tooLate")}>
            {t("callCentre")}{" "}
            <a href={siteContact.phoneHref} className="text-accent underline underline-offset-4">
              {siteContact.phone}
            </a>
          </Notice>
        ) : null}
        <CancelAppointment
          appointmentId={appointment.id}
          consequence={consequence}
          cancellable={appointment.status === "confirmed" && !started}
          cancelAction={cancelWithLinkAction}
          token={token}
        />
      </Card>
      <p className="mt-6 text-base">
        {t("change", { name: name || t("yourTherapist") })}{" "}
        <a href={siteContact.phoneHref} className="text-accent underline underline-offset-4">
          {siteContact.phone}
        </a>
      </p>
    </div>
  );
}
