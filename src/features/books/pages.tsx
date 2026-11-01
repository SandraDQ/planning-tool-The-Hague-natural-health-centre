import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ButtonLink, Card, EmptyState, Icons, Notice, buttonClasses, cn } from "@/design-system";
import { filingDeadline, parseQuarter, quarterBounds, quarterOf, shiftQuarter } from "@/lib/books/periods";
import { btwQuarter, costsByCategory, needsReceipt, periodTotals, type BooksInput } from "@/lib/books/summary";
import type { BankTransaction, Expense, Locale } from "@/lib/domain/types";
import { amountDue } from "@/lib/invoicing/status";
import { getStore, isDemoMode } from "@/lib/server/data";
import type { BooksAccess, BooksData } from "@/lib/server/extensions";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { formatEuro } from "@/features/dashboard/money";
import { addDays, localDay, monthRange, parseDayParam, todayLocal } from "@/features/dashboard/time";
import { HowItWorks } from "@/features/invoices/components/HowItWorks";
import { MonthNav, StatTile } from "@/features/invoices/components/InvoiceBits";
import { AcceptTermsForm, ConnectBankButton, PaymentActions, RenewConsentButton, RequestAddonButton, UndoMatchButton } from "./BankActions";
import { AddCostButton, EditCostButton, type BooksArea } from "./CostSheet";
import { AddonManager } from "./AddonManager";
import { Link } from "@/i18n/navigation";

const buttonLinkClasses = (variant: "primary" | "secondary") => buttonClasses({ variant, size: "lg" });
const basePath = (area: BooksArea) => (area === "admin" ? "/admin/books" : "/therapist/books");

type Loaded = { kind: "gate"; access: BooksAccess } | { kind: "books"; books: BooksData; input: BooksInput };

async function load(area: BooksArea, locale: Locale): Promise<Loaded> {
  const session = await requireRole(area, locale);
  const store = getStore().books;
  const access = await store.access(session);
  if (access.status !== "on") return { kind: "gate", access };
  const books = await store.getBooks(session);
  return {
    kind: "books",
    books,
    input: { invoices: books.invoices, expenses: books.expenses, transactions: books.transactions, deductsBtw: books.deductsBtw, dayOf: localDay },
  };
}

// ------------------------------------------------------------------ the gate --

/** Therapist without the add-on (or before agreeing to the terms): what it is and one button. */
async function AddonGate({ access, locale }: { access: BooksAccess; locale: Locale }) {
  const t = await getTranslations("books");
  const ta = await getTranslations("books.addon");
  return (
    <DashboardPage narrow>
      <PageHeading title={t("title")} />
      {access.status === "needs_terms" ? (
        <Card as="section" aria-labelledby="terms-title" className="mt-6 flex flex-col gap-4">
          <h2 id="terms-title" className="text-lg">
            {ta("termsTitle")}
          </h2>
          <p className="max-w-reading text-lg leading-relaxed">{ta("termsText")}</p>
          <AcceptTermsForm />
        </Card>
      ) : (
        <Card as="section" aria-labelledby="addon-title" className="mt-6 flex flex-col gap-4 border-sage bg-accent-soft/40">
          <h2 id="addon-title" className="text-lg">
            {access.status === "requested" ? ta("requestedTitle") : ta("title")}
          </h2>
          <p className="max-w-reading text-lg">{access.status === "requested" ? ta("requestedText") : ta("lead")}</p>
          <ul className="flex flex-col gap-2 text-lg">
            {[ta("point1"), ta("point2"), ta("point3")].map((p) => (
              <li key={p} className="flex gap-2">
                <Icons.Check className="mt-1 size-5 shrink-0 text-success" />
                {p}
              </li>
            ))}
          </ul>
          <p className="text-base text-fg-muted">{ta("price", { amount: formatEuro(access.feeCents, locale) })}</p>
          {access.status === "off" && (
            <div>
              <RequestAddonButton />
            </div>
          )}
        </Card>
      )}
    </DashboardPage>
  );
}

function BackLink({ area, label }: { area: BooksArea; label: string }) {
  return (
    <ButtonLink href={basePath(area)} variant="ghost" size="sm" className="-ml-3 mb-2">
      <Icons.ChevronLeft />
      {label}
    </ButtonLink>
  );
}

function LinkCard({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-md border border-border bg-surface p-5 text-fg no-underline transition-colors hover:border-accent hover:bg-accent-soft/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="shrink-0 text-accent [&_svg]:size-7">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg font-bold">{title}</span>
        <span className="text-base text-fg-muted">{text}</span>
      </span>
      <Icons.ChevronRight className="shrink-0 text-fg-muted" />
    </Link>
  );
}

// ---------------------------------------------------------------- home page --

export async function BooksHomePage({ area, locale, month: monthParam }: { area: BooksArea; locale: Locale; month?: string }) {
  const loaded = await load(area, locale);
  if (loaded.kind === "gate") return <AddonGate access={loaded.access} locale={locale} />;
  const { books, input } = loaded;
  const t = await getTranslations("books");
  const tc = await getTranslations("invoices.common");
  const format = await getFormatter();
  const today = todayLocal();
  // Early in a month there is little to show yet: open on last month until something is booked.
  const thisMonth = monthRange(today);
  const quiet = !books.expenses.some((e) => e.date >= thisMonth.first) && !books.invoices.some((i) => i.issuedAt && localDay(i.issuedAt) >= thisMonth.first);
  const month = monthRange(parseDayParam(monthParam) ?? (quiet ? addDays(thisMonth.first, -1) : today));
  const addons = area === "admin" ? await getStore().books.listAddons(await requireRole("admin", locale)) : null;
  const requests = addons?.therapists.filter((r) => r.status === "requested").length ?? 0;
  const monthLabel = format.dateTime(new Date(`${month.first}T12:00:00Z`), { month: "long", year: "numeric" });
  const totals = periodTotals(input, month.first, month.next);
  const categories = costsByCategory(input, month.first, month.next);
  const costs = books.expenses.filter((e) => e.date >= month.first && e.date < month.next);
  const unmatched = books.transactions.filter((x) => !x.match).length;
  const missing = books.expenses.filter(needsReceipt);
  const euro = (c: number) => formatEuro(c, locale);
  const longDay = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: "short", day: "numeric", month: "long" });

  return (
    <DashboardPage>
      <PageHeading title={t("title")} description={t("lead")} actions={<AddCostButton area={area} today={today} />} />
      <HowItWorks storageKey={`books-${area}`} title={t("welcomeTitle")} steps={[t("welcomeStep1"), t("welcomeStep2"), t("welcomeStep3")]} />

      {(unmatched > 0 || missing.length > 0 || requests > 0) && (
        <div className="mt-6 flex flex-col gap-3">
          {requests > 0 && (
            <Notice title={t("addonAdmin.requests", { count: requests })}>
              <a href="#addon-admin-title" className="underline">
                {t("addonAdmin.requestsText")}
              </a>
            </Notice>
          )}
          {unmatched > 0 && (
            <Notice
              tone="warning"
              title={t("bankNeedsLook", { count: unmatched })}
              action={
                <ButtonLink href={`${basePath(area)}/bank`} leadingIcon={<Icons.Bank />}>
                  {t("lookAtThem")}
                </ButtonLink>
              }
            >
              {t("bankNeedsLookText")}
            </Notice>
          )}
          {missing.length > 0 && (
            <Notice tone="warning" title={t("missingReceipts", { count: missing.length })}>
              {t("missingReceiptsText")}
            </Notice>
          )}
        </div>
      )}

      <section aria-labelledby="month-title" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="month-title" className="text-lg first-letter:uppercase">
            {monthLabel}
          </h2>
          <MonthNav
            pathname={basePath(area)}
            prev={monthRange(addDays(month.first, -1)).first}
            next={month.next}
            current={today}
            labels={{ previous: tc("previousMonth"), current: tc("thisMonth"), next: tc("nextMonth") }}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatTile label={t("tileIncome")} value={euro(totals.invoicedNetCents + totals.otherIncomeCents)} hint={t("tileIncomeHint")} />
          <StatTile label={t("tileCosts")} value={euro(totals.costsCents)} hint={books.deductsBtw ? t("tileCostsHintNet") : t("tileCostsHintGross")} />
          <StatTile label={t("tileResult")} value={euro(totals.resultCents)} hint={t("tileResultHint")} tone={totals.resultCents < 0 ? "warning" : "success"} />
        </div>
        {totals.stillToReceiveCents > 0 && <p className="mt-3 text-base text-fg-muted">{t("toReceive", { amount: euro(totals.stillToReceiveCents) })}</p>}

        {categories.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg">{t("byCategory")}</h3>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
              {categories.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 px-4 py-3 text-lg">
                  <span>{t(`categories.${c.category}`)}</span>
                  <span className="font-bold tabular-nums">{euro(c.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 className="mt-8 text-lg first-letter:uppercase">{t("costsTitle", { month: monthLabel })}</h3>
        {costs.length === 0 ? (
          <EmptyState className="mt-3" icon={<Icons.Receipt />} title={t("noCosts")} description={t("noCostsText")} />
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
            {costs.map((e) => (
              <CostRow key={e.id} expense={e} area={area} today={today} t={t} euro={euro} day={longDay(e.date)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="more-title" className="mt-10">
        <h2 id="more-title" className="sr-only">
          {t("moreTitle")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkCard href={`${basePath(area)}/bank`} icon={<Icons.Bank />} title={t("bankLink")} text={t("bankLinkText")} />
          <LinkCard href={`${basePath(area)}/btw`} icon={<Icons.Download />} title={t("btwLink")} text={t("btwLinkText")} />
        </div>
      </section>
      {addons && <AddonManager rows={addons.therapists} feeCents={addons.feeCents} />}
    </DashboardPage>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"books">>>;

function CostRow({ expense: e, area, today, t, euro, day }: { expense: Expense; area: BooksArea; today: string; t: T; euro: (c: number) => string; day: string }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-lg font-bold">{e.supplier}</p>
        <p className="text-base text-fg-muted first-letter:uppercase">
          {day} · {t(`categories.${e.category}`)}
          {e.description ? ` · ${e.description}` : ""}
        </p>
        <p className="mt-1 text-lg">
          <span className="font-bold tabular-nums">{euro(e.grossCents)}</span>{" "}
          <span className="text-base text-fg-muted">{e.btwRate === "exempt" ? t("noBtw") : t("btwLine", { amount: euro(e.btwCents), rate: t(`rates.${e.btwRate}`) })}</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
          {e.receipt ? (
            <a href={`/api/receipts/${e.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline" aria-label={t("openReceiptLabel", { supplier: e.supplier })}>
              <Icons.Receipt className="size-4" />
              {t("openReceipt")}
            </a>
          ) : needsReceipt(e) ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <Icons.Alert className="size-4" />
              {t("noReceipt")}
            </span>
          ) : null}
          {e.bankTransactionId && (
            <span className="inline-flex items-center gap-1">
              <Icons.Bank className="size-4" />
              {t("paidByBank")}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {needsReceipt(e) && <EditCostButton expense={e} area={area} today={today} variant="receipt" />}
        <EditCostButton expense={e} area={area} today={today} variant="edit" />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- bank page --

export async function BooksBankPage({ area, locale }: { area: BooksArea; locale: Locale }) {
  const loaded = await load(area, locale);
  if (loaded.kind === "gate") return <AddonGate access={loaded.access} locale={locale} />;
  const { books } = loaded;
  const t = await getTranslations("books");
  const tb = await getTranslations("books.bank");
  const format = await getFormatter();
  const today = todayLocal();
  const euro = (c: number) => formatEuro(c, locale);
  const shortDay = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "long" });
  const longDate = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" });

  const invoiceById = new Map(books.invoices.map((i) => [i.id, i]));
  const expenseById = new Map(books.expenses.map((e) => [e.id, e]));
  const openInvoices = books.invoices
    .filter((i) => i.kind !== "credit_note" && amountDue(i) > 0)
    .map((i) => ({ id: i.id, label: `${i.number} · ${i.buyer.name} · ${euro(amountDue(i))}` }));
  const openCosts = books.expenses.filter((e) => !e.bankTransactionId).map((e) => ({ id: e.id, label: `${e.supplier} · ${shortDay(e.date)} · ${euro(e.grossCents)}` }));
  const todo = books.transactions.filter((x) => !x.match);
  const done = books.transactions.filter((x) => x.match).slice(0, 30);
  const c = books.connection;
  const renewSoon = c ? c.consentUntil <= addDays(today, 30) : false;

  const suggestionText = (x: BankTransaction): string => {
    const s = books.suggestions[x.id];
    if (!s) return tb("suggestNone");
    if (s.kind === "invoice") {
      const inv = invoiceById.get(s.invoiceId);
      return tb("suggestInvoice", { number: inv?.number ?? "", name: inv?.buyer.name ?? "" });
    }
    if (s.kind === "expense") {
      const e = expenseById.get(s.expenseId);
      return tb("suggestExpense", { supplier: e?.supplier ?? "", date: e ? shortDay(e.date) : "" });
    }
    if (s.kind === "new_expense") return s.category ? tb("suggestNewExpense", { category: t(`categories.${s.category}`).toLowerCase() }) : tb("suggestNewExpenseUnknown");
    return tb("suggestCounted");
  };

  const matchText = (x: BankTransaction): string => {
    const m = x.match!;
    if (m.kind === "invoice") return tb("matchInvoice", { number: invoiceById.get(m.invoiceId)?.number ?? "" });
    if (m.kind === "expense") return tb("matchExpense", { supplier: expenseById.get(m.expenseId)?.supplier ?? "" });
    return tb(m.kind === "other_income" ? "matchOtherIncome" : m.kind === "counted" ? "matchCounted" : "matchPrivate");
  };

  const head = (x: BankTransaction) => (
    <div className="min-w-0">
      <p className="text-base text-fg-muted first-letter:uppercase">{shortDay(x.bookedOn)}</p>
      <p className="text-lg font-bold">{x.counterparty}</p>
      <p className="text-base text-fg-muted">{x.description}</p>
    </div>
  );
  const amount = (x: BankTransaction) => (
    <p className={cn("shrink-0 text-xl tabular-nums", x.amountCents > 0 && "text-success")}>
      <span className="sr-only">{x.amountCents > 0 ? tb("in") : tb("out")} </span>
      {x.amountCents > 0 ? "+ " : "− "}
      {euro(Math.abs(x.amountCents))}
    </p>
  );

  return (
    <DashboardPage>
      <BackLink area={area} label={t("back")} />
      <PageHeading title={tb("title")} description={tb("lead")} />
      <HowItWorks storageKey={`books-bank-${area}`} title={tb("welcomeTitle")} steps={[tb("welcomeStep1"), tb("welcomeStep2"), tb("welcomeStep3")]} />

      {c ? (
        <Card className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <Icons.Bank className="mt-1 size-6 shrink-0 text-accent" />
            <div>
              <p className="text-lg font-bold">{tb("connectedTitle", { bank: c.bankName, last4: c.iban.slice(-4) })}</p>
              <p className="text-base">{renewSoon ? tb("renewSoon", { date: longDate(c.consentUntil) }) : tb("connectedText", { date: longDate(c.consentUntil) })}</p>
              <p className="text-sm text-fg-muted">{tb("readOnly")}</p>
              {c.demo && <p className="text-sm text-fg-muted">{tb("demoBank")}</p>}
            </div>
          </div>
          <RenewConsentButton area={area} primary={renewSoon} />
        </Card>
      ) : (
        <Notice className="mt-6" title={tb("notConnectedTitle")} action={<ConnectBankButton area={area} />}>
          {tb("notConnectedText")}
          {isDemoMode() && <span className="mt-1 block text-sm text-fg-muted">{tb("demoBank")}</span>}
        </Notice>
      )}

      <section aria-labelledby="todo-title" className="mt-8">
        <h2 id="todo-title" className="text-lg">
          {tb("needsLookTitle")} {todo.length > 0 && <span className="text-fg-muted">({todo.length})</span>}
        </h2>
        {todo.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-lg text-success">
            <Icons.Check className="size-5" />
            {tb("needsLookEmpty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {todo.map((x) => (
              <li key={x.id}>
                <Card className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    {head(x)}
                    {amount(x)}
                  </div>
                  <p className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-lg">
                    <Icons.Info className="mt-1 size-5 shrink-0 text-accent" />
                    {suggestionText(x)}
                  </p>
                  <PaymentActions transaction={x} suggestion={books.suggestions[x.id] ?? null} area={area} today={today} openInvoices={openInvoices} openCosts={openCosts} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-title" className="mt-10">
        <h2 id="done-title" className="text-lg">
          {tb("doneTitle")}
        </h2>
        {done.length === 0 ? (
          <p className="mt-2 text-base text-fg-muted">{tb("doneEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
            {done.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                {head(x)}
                <div className="flex shrink-0 flex-col gap-1 sm:items-end">
                  {amount(x)}
                  <p className="flex items-center gap-1 text-sm text-fg-muted">
                    <Icons.Check className="size-4 text-success" />
                    {matchText(x)}
                  </p>
                  <UndoMatchButton transactionId={x.id} area={area} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardPage>
  );
}

// ----------------------------------------------------------------- BTW page --

export async function BooksBtwPage({ area, locale, quarter: quarterParam }: { area: BooksArea; locale: Locale; quarter?: string }) {
  const loaded = await load(area, locale);
  if (loaded.kind === "gate") return <AddonGate access={loaded.access} locale={locale} />;
  const { books, input } = loaded;
  const t = await getTranslations("books");
  const tq = await getTranslations("books.btw");
  const format = await getFormatter();
  const today = todayLocal();
  const quarter = parseQuarter(quarterParam) ?? quarterOf(today);
  const { first, next } = quarterBounds(quarter);
  const s = btwQuarter(input, first, next);
  const euro = (c: number) => formatEuro(c, locale);
  const longDate = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" });
  const path = `${basePath(area)}/btw`;
  const exportHref = (fmt: "zip" | "csv") => `/api/books/export?quarter=${quarter}&format=${fmt}&locale=${locale}`;
  const filing = books.btwNote !== "kor";

  const row = (label: string, net: number | null, btw: number | null) => (
    <tr className="border-t border-border">
      <th scope="row" className="py-3 pr-4 text-left text-base font-normal">
        {label}
      </th>
      <td className="py-3 pr-4 text-right text-lg tabular-nums">{net === null ? "" : euro(net)}</td>
      <td className="py-3 text-right text-lg tabular-nums">{btw === null ? "" : euro(btw)}</td>
    </tr>
  );

  return (
    <DashboardPage>
      <BackLink area={area} label={t("back")} />
      <PageHeading title={tq("title")} description={tq("lead")} />
      <HowItWorks storageKey={`books-btw-${area}`} title={tq("welcomeTitle")} steps={[tq("welcomeStep1"), tq("welcomeStep2"), tq("welcomeStep3")]} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{tq("quarter", { q: quarter.slice(6), year: quarter.slice(0, 4) })}</h2>
        <div className="flex shrink-0 items-center">
          <ButtonLink href={{ pathname: path, query: { quarter: shiftQuarter(quarter, -1) } }} variant="ghost" size="sm" aria-label={tq("previous")}>
            <Icons.ChevronLeft />
          </ButtonLink>
          <ButtonLink href={path} variant="ghost" size="sm">
            {tq("current")}
          </ButtonLink>
          <ButtonLink href={{ pathname: path, query: { quarter: shiftQuarter(quarter, 1) } }} variant="ghost" size="sm" aria-label={tq("next")}>
            <Icons.ChevronRight />
          </ButtonLink>
        </div>
      </div>

      <Notice className="mt-3" title={tq("forAccountant")}>
        {tq("forAccountantText")}
        {filing && books.btwNote === null && <span className="mt-1 block">{tq("deadline", { date: longDate(filingDeadline(quarter)) })}</span>}
      </Notice>
      {books.btwNote && <p className="mt-3 max-w-reading text-lg">{books.btwNote === "kor" ? tq("korNote") : tq("exemptNote")}</p>}

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-sm text-fg-muted">
              <th className="pb-2 text-left font-normal">
                <span className="sr-only">{tq("title")}</span>
              </th>
              <th className="pb-2 text-right font-normal">{tq("excl")}</th>
              <th className="pb-2 text-right font-normal">{tq("btwCol")}</th>
            </tr>
          </thead>
          <tbody>
            {row(tq("sales21"), s.sales["21"].netCents, s.sales["21"].btwCents)}
            {row(tq("sales9"), s.sales["9"].netCents, s.sales["9"].btwCents)}
            {row(tq("salesExempt"), s.sales.exempt.netCents, null)}
            {books.deductsBtw && row(tq("inputBtw"), null, s.inputBtwCents)}
          </tbody>
        </table>
        <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-fg pt-4">
          <span className="text-lg font-bold">{s.balanceCents > 0 ? tq("toPay") : s.balanceCents < 0 ? tq("toGetBack") : tq("nothing")}</span>
          <span className="text-2xl tabular-nums">{euro(Math.abs(s.balanceCents))}</span>
        </p>
        <p className="mt-2 text-sm text-fg-muted">{tq("counts", { invoices: s.invoiceCount, costs: s.costCount })}</p>
      </Card>

      <section aria-labelledby="check-title" className="mt-8">
        <h2 id="check-title" className="text-lg">
          {tq("checkTitle")}
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {s.missingReceipts === 0 && s.unmatchedTransactions === 0 ? (
            <Notice tone="success" title={tq("checkOk")} />
          ) : (
            <>
              {s.missingReceipts > 0 && (
                <Notice tone="warning" title={tq("checkReceipts", { count: s.missingReceipts })} action={<ButtonLink href={basePath(area)} size="sm">{tq("fix")}</ButtonLink>} />
              )}
              {s.unmatchedTransactions > 0 && (
                <Notice
                  tone="warning"
                  title={tq("checkBank", { count: s.unmatchedTransactions })}
                  action={
                    <ButtonLink href={`${basePath(area)}/bank`} size="sm">
                      {tq("fix")}
                    </ButtonLink>
                  }
                />
              )}
            </>
          )}
        </div>
      </section>

      <Card as="section" aria-labelledby="download-title" className="mt-8 flex flex-col gap-3">
        <h2 id="download-title" className="text-lg">
          {tq("downloadTitle")}
        </h2>
        <p className="max-w-reading text-lg">{tq("downloadText")}</p>
        <div className="flex flex-wrap gap-3">
          <a href={exportHref("zip")} download className={buttonLinkClasses("primary")}>
            <Icons.Download />
            {tq("downloadZip")}
          </a>
          <a href={exportHref("csv")} download className={buttonLinkClasses("secondary")}>
            <Icons.Download />
            {tq("downloadCsv")}
          </a>
        </div>
      </Card>
    </DashboardPage>
  );
}
