import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Icons, type BadgeTone } from "@/design-system";
import type { Appointment, AppointmentStatus } from "@/lib/domain/types";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { CancelAppointment } from "@/features/booking/components/CancelAppointment";
import { loadCatalog, loadPolicy } from "@/features/booking/server/catalog";
import { clientArea } from "@/features/booking/server/client-area";
import { asLocale, bookingMetadata } from "@/features/booking/server/pages";
import { freeCancelDeadline } from "@/features/booking/policy";
import { TIME_ZONE } from "@/features/booking/time";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "booking.account" });
  return bookingMetadata(locale, t("metaTitle"));
}

const statusTone: Record<AppointmentStatus, BadgeTone> = {
  held: "warning",
  confirmed: "success",
  cancelled: "neutral",
  no_show: "danger",
  completed: "neutral",
};

/** Client area: my appointments, with cancel. */
export default async function AccountPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireRole("client", locale);
  const t = await getTranslations("booking.account");
  const format = await getFormatter();
  const store = getStore();
  const area = clientArea(store);

  const [appointments, catalog, me] = await Promise.all([
    area.listMyAppointments ? area.listMyAppointments(session).catch(() => null) : Promise.resolve(null),
    loadCatalog(locale).catch(() => null),
    area.getMe ? area.getMe(session).catch(() => null) : Promise.resolve(null),
  ]);
  const names = new Map(catalog?.therapists.map((th) => [th.id, th.displayName]) ?? []);
  const now = Date.now();
  // Holds that were never paid (abandoned, failed, expired) are not appointments to the client.
  // A confirmed booking has holdExpiresAt cleared, so a cancelled one with it still set was never paid.
  const visible = (appointments ?? []).filter((a) =>
    a.status === "held" ? !!a.holdExpiresAt && Date.parse(a.holdExpiresAt) > now : !(a.status === "cancelled" && a.holdExpiresAt),
  );
  // Sorted by when the session is, not by status: a cancelled future appointment stays in date order.
  const upcoming = visible
    .filter((a) => Date.parse(a.session.end) > now)
    .sort((a, b) => a.session.start.localeCompare(b.session.start));
  const past = visible
    .filter((a) => Date.parse(a.session.end) <= now && a.status !== "held")
    .sort((a, b) => b.session.start.localeCompare(a.session.start))
    .slice(0, 10);
  const policies = new Map(
    await Promise.all(
      [...new Set(upcoming.map((a) => a.therapistId))].map(async (id) => [id, await loadPolicy(id).catch(() => null)] as const),
    ),
  );

  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const when = (a: Appointment) =>
    format.dateTime(new Date(a.session.start), {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: TIME_ZONE,
    });

  const consequence = (a: Appointment) => {
    const policy = policies.get(a.therapistId) ?? null;
    if (now <= freeCancelDeadline(a.session.start, policy)) return t("cancelOnTime", { deposit: euro(a.snapshot.depositCents) });
    const notice = policy
      ? policy.noticeUnit === "hours"
        ? t("noticeHours", { n: policy.noticeValue })
        : t("noticeDays", { n: policy.noticeValue })
      : t("noticeHours", { n: 24 });
    return t("cancelLate", { notice, name: names.get(a.therapistId) ?? "" });
  };

  const row = (a: Appointment, canCancel: boolean) => {
    const therapistName = names.get(a.therapistId);
    const sub = a.snapshot.sessionTypeName[locale] !== a.snapshot.serviceName[locale] ? a.snapshot.sessionTypeName[locale] : null;
    return (
      <li key={a.id}>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-base font-bold first-letter:uppercase">{when(a)}</p>
            <Badge tone={statusTone[a.status]}>{t(`status.${a.status}`)}</Badge>
          </div>
          <div className="flex items-center gap-3">
            {therapistName && <Avatar name={therapistName} size="sm" />}
            <div className="min-w-0">
              <p className="text-base">{[a.snapshot.serviceName[locale], sub].filter(Boolean).join(" · ")}</p>
              <p className="text-sm text-fg-muted">
                {therapistName ? `${t("with", { name: therapistName })} · ` : ""}
                {a.snapshot.durationMin} min
              </p>
            </div>
          </div>
          {a.status === "confirmed" && (
            <p className="text-sm text-fg-muted">
              {t("depositPaid", { deposit: euro(a.snapshot.depositCents), balance: euro(Math.max(0, a.snapshot.priceCents - a.snapshot.depositCents)) })}
            </p>
          )}
          {canCancel && (a.status === "confirmed" || a.status === "cancelled") && (
            <CancelAppointment appointmentId={a.id} consequence={consequence(a)} cancellable={a.status === "confirmed"} />
          )}
        </Card>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-reading px-gutter pt-8 pb-12 sm:pt-12 lg:pb-20">
      <p className="text-base text-fg-muted">{t("hello", { name: me?.firstName ?? session.displayName })}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <h1 id="page-title" className="text-xl">
          {t("title")}
        </h1>
        <ButtonLink href="/book" leadingIcon={<Icons.CalendarIcon />}>
          {t("book")}
        </ButtonLink>
      </div>

      {appointments === null ? (
        <EmptyState className="mt-8" icon={<Icons.CalendarIcon />} title={t("notReadyTitle")} description={t("notReadyText")} />
      ) : (
        <>
          <section aria-labelledby="upcoming-title" className="mt-8">
            <h2 id="upcoming-title" className="text-lg">
              {t("upcoming")}
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState icon={<Icons.CalendarIcon />} title={t("emptyTitle")} description={t("emptyText")} />
            ) : (
              <ul className="mt-3 flex flex-col gap-3">{upcoming.map((a) => row(a, !!area.cancelAppointment))}</ul>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-title" className="mt-10">
              <h2 id="past-title" className="text-lg">
                {t("past")}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">{past.map((a) => row(a, false))}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
