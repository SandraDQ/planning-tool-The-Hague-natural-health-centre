import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, Card, EmptyState, Icons } from "@/design-system";
import type { Invoice, Locale } from "@/lib/domain/types";
import { amountDue, invoicePaymentStatus } from "@/lib/invoicing/status";
import { getStore, isDemoMode } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { formatEuro } from "@/features/dashboard/money";
import { addDays, monthRange, parseDayParam, todayLocal } from "@/features/dashboard/time";
import { HowItWorks } from "@/features/invoices/components/HowItWorks";
import { MonthNav, PdfLink, StatTile, StatusBadge } from "@/features/invoices/components/InvoiceBits";
import { MarkPaid, PrepareButton, SendDraftsButton } from "@/features/invoices/admin/RentInvoiceActions";

/** Admin: the monthly room-rent run (prepare → check → send) and who still owes rent. Never client invoices. */
export default async function AdminInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as Locale;
  const session = await requireRole("admin", locale);
  const t = await getTranslations("invoices.admin");
  const tc = await getTranslations("invoices.common");
  const format = await getFormatter();
  const store = getStore().admin;

  const today = todayLocal();
  const month = monthRange(parseDayParam((await searchParams).month) ?? today);
  const monthLabel = format.dateTime(new Date(`${month.first}T12:00:00Z`), { month: "long", year: "numeric" });
  const [all, therapists] = await Promise.all([store.listRentInvoices(session), store.listTherapists(session)]);
  const nameOf = (inv: Invoice) => therapists.find((x) => x.id === inv.buyerTherapistId)?.displayName ?? inv.buyer.name;

  const ofMonth = all.filter((i) => i.rentMonth === month.first);
  const drafts = ofMonth.filter((i) => i.status === "draft").sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const issued = ofMonth.filter((i) => i.status === "issued");
  const owing = all.filter((i) => amountDue(i) > 0).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const invoicedCents = issued.reduce((n, i) => n + i.totalCents, 0);
  const paidCents = issued.reduce((n, i) => n + i.paidCents, 0);
  const openOfMonth = issued.filter((i) => amountDue(i) > 0);
  const longDay = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "long" });
  const monthOf = (inv: Invoice) => (inv.rentMonth ? format.dateTime(new Date(`${inv.rentMonth}T12:00:00Z`), { month: "long", year: "numeric" }) : "");

  const issuedRow = (inv: Invoice, showMonth: boolean) => {
    const status = invoicePaymentStatus(inv, today);
    return (
      <li key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-lg">{nameOf(inv)}</p>
          <p className="text-base text-fg-muted first-letter:uppercase">
            {showMonth ? `${monthOf(inv)} · ` : ""}
            {inv.number}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold tabular-nums">{formatEuro(inv.totalCents, locale)}</span>
            <StatusBadge status={status} label={tc(`status.${status}`)} />
            <span className="text-sm text-fg-muted">
              {status === "paid" && inv.paidOn ? tc("paidOn", { date: longDay(inv.paidOn) }) : inv.dueOn ? tc("dueOn", { date: longDay(inv.dueOn) }) : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PdfLink invoiceId={inv.id} label={tc("openPdf")} ariaLabel={tc("openPdfLabel", { number: inv.number ?? "" })} />
          <MarkPaid invoiceId={inv.id} paid={status === "paid"} name={nameOf(inv)} totalCents={inv.totalCents} today={today} />
        </div>
      </li>
    );
  };

  return (
    <DashboardPage>
      <PageHeading
        title={t("title")}
        description={t("lead")}
        actions={
          <ButtonLink href="/admin/rent" variant="ghost" size="sm" leadingIcon={<Icons.Sliders />}>
            {t("estimateLink")}
          </ButtonLink>
        }
      />
      <HowItWorks storageKey="admin-invoices" title={t("welcomeTitle")} steps={[t("welcomeStep1"), t("welcomeStep2"), t("welcomeStep3")]} />

      <section aria-labelledby="owes-title" className="mt-8">
        <h2 id="owes-title" className="text-lg">
          {t("owesTitle")}
        </h2>
        {owing.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-base text-success">
            <Icons.Check className="size-5" />
            {t("owesEmpty")}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">{owing.map((inv) => issuedRow(inv, true))}</ul>
        )}
      </section>

      <section aria-labelledby="month-title" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="month-title" className="text-lg first-letter:uppercase">
            {t("monthTitle", { month: monthLabel })}
          </h2>
          <MonthNav
            pathname="/admin/invoices"
            prev={monthRange(addDays(month.first, -1)).first}
            next={month.next}
            labels={{ previous: tc("previousMonth"), current: tc("thisMonth"), next: tc("nextMonth") }}
          />
        </div>

        {issued.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatTile label={t("tileInvoiced", { month: monthLabel })} value={formatEuro(invoicedCents, locale)} />
            <StatTile label={t("tilePaid")} value={formatEuro(paidCents, locale)} tone="success" />
            <StatTile
              label={t("tileOpen")}
              value={formatEuro(invoicedCents - paidCents, locale)}
              hint={t("tileOpenHint", { count: openOfMonth.length })}
              tone={openOfMonth.length ? "warning" : undefined}
            />
          </div>
        )}

        {ofMonth.length === 0 && (
          <EmptyState
            className="mt-3"
            icon={<Icons.Euro />}
            title={t("nothingYet")}
            description={t("nothingYetText")}
            action={<PrepareButton month={month.first} />}
          />
        )}

        {drafts.length > 0 && (
          <Card as="section" aria-labelledby="drafts-title" className="mt-4 border-warning" padded={false}>
            <div className="p-5 sm:p-6">
              <h3 id="drafts-title" className="text-lg">
                {t("draftsTitle")}
              </h3>
              <p className="mt-1 max-w-reading text-base text-fg-muted">{t("draftsLead")}</p>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {drafts.map((inv) => (
                <li key={inv.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="text-lg">{nameOf(inv)}</p>
                    <ul className="mt-1 text-base text-fg-muted">
                      {inv.lines.map((l, i) => (
                        <li key={i}>
                          {l.description}
                          {l.quantity > 1 ? ` · ${l.quantity} × ${formatEuro(l.unitCents, locale)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-lg font-bold tabular-nums sm:text-right">{formatEuro(inv.totalCents, locale)}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 sm:px-6">
              <PrepareButton month={month.first} again />
              <SendDraftsButton ids={drafts.map((d) => d.id)} />
            </div>
          </Card>
        )}

        {issued.length > 0 && (
          <>
            <h3 className="mt-6 text-lg">{t("issuedTitle")}</h3>
            <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
              {[...issued].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((inv) => issuedRow(inv, false))}
            </ul>
            {drafts.length === 0 && (
              <div className="mt-3">
                <PrepareButton month={month.first} again />
              </div>
            )}
          </>
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
