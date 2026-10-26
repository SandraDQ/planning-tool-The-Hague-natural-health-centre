import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, Card, Icons, siteContact } from "@/design-system";
import { redirect } from "@/i18n/navigation";
import { getStore, isDemoMode } from "@/lib/server/data";
import { getSession } from "@/lib/server/session";
import { AppointmentSummary } from "@/features/booking/components/AppointmentSummary";
import { ClearDraft } from "@/features/booking/components/ClearDraft";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { findTherapist, loadPolicy } from "@/features/booking/server/catalog";
import { clientArea } from "@/features/booking/server/client-area";
import { ownsBooking } from "@/features/booking/server/ownership";
import { asLocale, bookingMetadata } from "@/features/booking/server/pages";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "booking.confirmed" });
  return bookingMetadata(locale, `${t("title")} | The Hague Natural Health Centre`);
}

/** Confirmation, shown only after the (demo) payment webhook confirmed the booking. */
export default async function BookConfirmedPage({ params }: Props) {
  const { locale: raw, id } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations("booking.confirmed");
  const tp = await getTranslations("booking.details");
  const format = await getFormatter();

  let appointment;
  try {
    appointment = await getStore().booking.getAppointment(id);
  } catch {
    return <BookingUnavailable />;
  }
  if (!appointment || !(await ownsBooking(appointment))) notFound();
  if (appointment.status !== "confirmed" && appointment.status !== "completed") redirect({ href: `/book/pay/${id}`, locale });

  const [therapist, policy, session] = await Promise.all([
    findTherapist(locale, appointment.therapistId).catch(() => null),
    loadPolicy(appointment.therapistId).catch(() => null),
    getSession(),
  ]);
  const s = appointment.snapshot;
  const name = therapist?.displayName ?? "";
  const balance = format.number(Math.max(0, s.priceCents - s.depositCents) / 100, { style: "currency", currency: "EUR" });
  const signedIn = session?.role === "client";
  const me = signedIn ? await clientArea(getStore()).getMe?.(session!).catch(() => null) : null;
  const firstName = me && me.id === appointment.clientId ? me.firstName : null;

  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-12 sm:pt-14 lg:pb-20">
      {/* Also rendered here (React hoists it to <head>): after the payment's client-side
          redirect, streamed metadata can arrive after the page, leaving no title for a moment. */}
      <title>{`${t("title")} | The Hague Natural Health Centre`}</title>
      <ClearDraft />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col items-start gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success [&_svg]:size-7">
              <Icons.Check strokeWidth={2.25} />
            </span>
            <div>
              <h1 id="page-title" className="text-xl">
                {t("title")}
              </h1>
              <p className="mt-2 text-base">{firstName ? t("intro", { name: firstName }) : t("introNoName")}</p>
              <p className="mt-1 text-base text-fg-muted">
                {t("emailNote")}
                {isDemoMode() && <span className="block text-sm">{t("demoEmail")}</span>}
              </p>
            </div>
          </div>

          <div className="lg:hidden">
            <AppointmentSummary data={summaryData()} start={appointment.session.start} paid showNotes={false} />
          </div>

          <section aria-labelledby="next-title">
            <h2 id="next-title" className="text-lg">
              {t("nextTitle")}
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {[t("next1"), t("next2", { name }), t("next3", { hours: therapist?.reminderHours ?? 24 }), t("next4", { balance })].map((line, i) => (
                <li key={i} className="flex gap-3 text-base">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-heading text-sm text-accent-strong" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{line}</span>
                </li>
              ))}
            </ol>
          </section>

          <Card as="section" aria-labelledby="contact-title" className="flex flex-col gap-2">
            <h2 id="contact-title" className="text-lg">
              {t("contactTitle")}
            </h2>
            {therapist?.publicEmail && (
              <p className="text-base">
                {t("contactText", { name })}{" "}
                <a href={`mailto:${therapist.publicEmail}`} className="break-all text-accent underline underline-offset-4">
                  {therapist.publicEmail}
                </a>
              </p>
            )}
            <p className="text-base text-fg-muted">
              {t("contactCentre")}{" "}
              <a href={siteContact.phoneHref} className="text-accent underline underline-offset-4">
                {siteContact.phone}
              </a>
            </p>
          </Card>

          <section aria-labelledby="policy-title">
            <h2 id="policy-title" className="text-lg">
              {t("policyTitle")}
            </h2>
            <p className="mt-2 text-base whitespace-pre-line">{policy?.text[locale] || tp("policyNone")}</p>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            {signedIn ? (
              <ButtonLink href="/account" size="lg">
                {t("myAppointments")}
              </ButtonLink>
            ) : (
              <ButtonLink href="/" size="lg">
                {t("home")}
              </ButtonLink>
            )}
            <ButtonLink href="/book" variant="secondary" size="lg">
              {t("bookAnother")}
            </ButtonLink>
          </div>
          <p className="text-sm text-fg-muted">
            {t("reference")}: <span className="font-mono">{appointment.id.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
          <AppointmentSummary data={summaryData()} start={appointment.session.start} paid showNotes={false} />
        </aside>
      </div>
    </div>
  );

  function summaryData() {
    return {
      therapistName: name,
      therapistPhoto: therapist?.photoUrl,
      serviceName: s.serviceName[locale],
      sessionTypeName: s.sessionTypeName[locale],
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      depositCents: s.depositCents,
    };
  }
}
