import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, Icons } from "@/design-system";
import type { Locale } from "@/lib/domain/types";
import { getStore, isDemoMode } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { formatEuro } from "@/features/dashboard/money";
import { addDays, localToIso, monthRange, parseDayParam, todayLocal } from "@/features/dashboard/time";
import { HowItWorks } from "@/features/invoices/components/HowItWorks";
import { MonthNav, StatTile } from "@/features/invoices/components/InvoiceBits";
import { InvoiceList } from "@/features/invoices/components/InvoiceList";
import { OutstandingList, type OutstandingRow } from "@/features/invoices/therapist/OutstandingList";

/** Therapist: who still has to pay, money in this month, invoices sent, and rent invoices from the centre. */
export default async function TherapistInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as Locale;
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("invoices.therapist");
  const tc = await getTranslations("invoices.common");
  const format = await getFormatter();
  const store = getStore().therapist;

  const today = todayLocal();
  const month = monthRange(parseDayParam((await searchParams).month) ?? today);
  const monthLabel = format.dateTime(new Date(`${month.first}T12:00:00Z`), { month: "long", year: "numeric" });
  // Payments received this month can belong to sessions from the month before.
  const paymentWindow = { start: localToIso(addDays(month.first, -30), "00:00"), end: month.end };

  const [outstanding, invoices, rent, appointments] = await Promise.all([
    store.listOutstanding(session),
    store.listMyInvoices(session, { from: month.first, to: month.next }),
    store.listMyRentInvoices(session),
    store.listMyAppointments(session, paymentWindow),
  ]);
  const payments = appointments.length ? await store.listBalancePayments(session, appointments.map((a) => a.id)) : [];
  const receivedCents =
    invoices.filter((i) => i.kind === "deposit" || i.kind === "credit_note").reduce((n, i) => n + i.totalCents, 0) +
    payments.filter((p) => p.paidOn >= month.first && p.paidOn < month.next).reduce((n, p) => n + p.amountCents, 0);
  const invoicedCents = invoices.reduce((n, i) => n + i.totalCents, 0);
  const owedCents = outstanding.reduce((n, r) => n + r.dueCents, 0);

  const rows: OutstandingRow[] = outstanding.map((r) => {
    const a = r.appointment;
    const service = a.snapshot.sessionTypeName[locale] !== a.snapshot.serviceName[locale] ? `${a.snapshot.serviceName[locale]} · ${a.snapshot.sessionTypeName[locale]}` : a.snapshot.serviceName[locale];
    return {
      appointmentId: a.id,
      start: a.session.start,
      end: a.session.end,
      clientName: r.clientName,
      hasEmail: !!r.clientEmail,
      service,
      priceCents: r.priceCents,
      paidCents: r.depositPaidCents + r.balancePaidCents,
      dueCents: r.dueCents,
      finalInvoice: r.finalInvoice ? { id: r.finalInvoice.id, number: r.finalInvoice.number!, issuedAt: r.finalInvoice.issuedAt!, sentAt: r.finalInvoice.sentAt } : null,
    };
  });

  return (
    <DashboardPage>
      <PageHeading title={t("title")} description={t("lead")} />
      <HowItWorks storageKey="therapist-invoices" title={t("welcomeTitle")} steps={[t("welcomeStep1"), t("welcomeStep2"), t("welcomeStep3")]} />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatTile label={t("tileOutstanding")} value={formatEuro(owedCents, locale)} hint={t("tileOutstandingHint", { count: rows.length })} tone={owedCents > 0 ? "warning" : "success"} />
        <StatTile label={t("tileReceived", { month: monthLabel })} value={formatEuro(receivedCents, locale)} hint={t("tileReceivedHint")} />
        <StatTile label={t("tileInvoiced", { month: monthLabel })} value={formatEuro(invoicedCents, locale)} hint={t("tileInvoicedHint", { count: invoices.length })} />
      </div>

      <section aria-labelledby="outstanding-title" className="mt-8">
        <h2 id="outstanding-title" className="text-lg">
          {t("outstandingTitle")}
        </h2>
        {rows.length === 0 ? (
          <EmptyState className="mt-3" icon={<Icons.Check />} title={t("outstandingEmpty")} description={t("outstandingEmptyText")} />
        ) : (
          <OutstandingList rows={rows} today={today} />
        )}
      </section>

      <section aria-labelledby="invoices-title" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="invoices-title" className="text-lg first-letter:uppercase">
            {t("invoicesTitle", { month: monthLabel })}
          </h2>
          <MonthNav
            pathname="/therapist/invoices"
            prev={monthRange(addDays(month.first, -1)).first}
            next={month.next}
            labels={{ previous: tc("previousMonth"), current: tc("thisMonth"), next: tc("nextMonth") }}
          />
        </div>
        {invoices.length === 0 ? (
          <p className="mt-3 text-base text-fg-muted">{t("invoicesEmpty")}</p>
        ) : (
          <InvoiceList invoices={invoices} today={today} locale={locale} show="buyer" />
        )}
      </section>

      <section aria-labelledby="rent-title" className="mt-10">
        <h2 id="rent-title" className="text-lg">
          {t("rentTitle")}
        </h2>
        <p className="mt-1 text-base text-fg-muted">{t("rentLead")}</p>
        {rent.length === 0 ? (
          <p className="mt-3 text-base text-fg-muted">{t("rentEmpty")}</p>
        ) : (
          <InvoiceList invoices={rent} today={today} locale={locale} show="seller" />
        )}
      </section>
      {isDemoMode() && (
        <p className="mt-8 flex items-start gap-2 text-sm text-fg-muted">
          <Icons.Info className="mt-0.5 size-4 shrink-0" />
          {tc("demoMail")}
        </p>
      )}
    </DashboardPage>
  );
}
