import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, ButtonLink, Card, Icons, dayToDate } from "@/design-system";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { RentManager } from "@/features/dashboard/admin/RentManager";
import { estimateMonthlyRent } from "@/features/dashboard/rent";
import { formatEuro } from "@/features/dashboard/money";
import { addDays, monthRange, parseDayParam, todayLocal } from "@/features/dashboard/time";

export default async function AdminRentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("admin.rent");
  const format = await getFormatter();
  const store = getStore().admin;

  const today = todayLocal();
  const month = monthRange(parseDayParam((await searchParams).month) ?? today);
  const [rooms, rates, settings, therapists, grid] = await Promise.all([
    store.listRooms(session),
    store.listRentRates(session),
    store.getRentSettings(session),
    store.listTherapists(session),
    store.roomGrid(session, month),
  ]);
  const estimates = estimateMonthlyRent({ therapists, rooms, rates, blocks: grid.blocks, monthFirstDay: month.first });
  const roomNumber = new Map(rooms.map((r) => [r.id, r.number]));
  const totalNet = estimates.reduce((n, e) => n + e.netCents, 0);
  const totalBtw = estimates.reduce((n, e) => n + e.btwCents, 0);
  const prevMonth = monthRange(addDays(month.first, -1)).first;
  const monthLabel = format.dateTime(dayToDate(month.first), { month: "long", year: "numeric" });

  return (
    <DashboardPage>
      <PageHeading title={t("title")} description={t("lead")} />
      <RentManager rooms={rooms} rates={rates} settings={settings} today={today} />

      <Card as="section" aria-labelledby="estimate-title" className="mt-6" padded={false}>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="estimate-title" className="text-lg first-letter:uppercase">
                {t("estimateTitle", { month: monthLabel })}
              </h2>
              <Badge tone="warning">{t("estimate")}</Badge>
            </div>
            <p className="mt-1 max-w-reading text-sm text-fg-muted">{t("estimateText")}</p>
          </div>
          <div className="flex shrink-0 items-center">
            <ButtonLink href={{ pathname: "/admin/rent", query: { month: prevMonth } }} variant="ghost" size="sm" aria-label={t("previousMonth")}>
              <Icons.ChevronLeft />
            </ButtonLink>
            <ButtonLink href="/admin/rent" variant="ghost" size="sm">
              {t("thisMonth")}
            </ButtonLink>
            <ButtonLink href={{ pathname: "/admin/rent", query: { month: month.next } }} variant="ghost" size="sm" aria-label={t("nextMonth")}>
              <Icons.ChevronRight />
            </ButtonLink>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[36rem] text-left text-base">
            <thead className="bg-surface-2 text-sm text-fg-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                  {t("renter")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("basis")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("net")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("btwAmount")}
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {therapists.map((x) => {
                const e = estimates.find((r) => r.therapistId === x.id)!;
                return (
                  <tr key={x.id} className="align-top">
                    <th scope="row" className="px-5 py-3 font-normal sm:px-6">
                      {x.displayName}
                    </th>
                    <td className="px-3 py-3 text-sm text-fg-muted">
                      {e.lines.length === 0 && <span>{t("nothing")}</span>}
                      {e.lines.map((l) => (
                        <span key={`${l.roomId}${l.mode}`} className="block">
                          {l.mode === "fixed_monthly"
                            ? t("lineFixed", { number: roomNumber.get(l.roomId) ?? "?" })
                            : t("lineBlocks", { count: l.blocks, number: roomNumber.get(l.roomId) ?? "?" })}
                        </span>
                      ))}
                      {e.unpriced > 0 && <span className="block text-warning">{t("unpriced", { count: e.unpriced })}</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatEuro(e.netCents, locale)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatEuro(e.btwCents, locale)}</td>
                    <td className="px-5 py-3 text-right tabular-nums sm:px-6">{formatEuro(e.netCents + e.btwCents, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border-strong/40">
              <tr>
                <th scope="row" colSpan={2} className="px-5 py-3 text-left font-normal sm:px-6">
                  {t("totalAll")}
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{formatEuro(totalNet, locale)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatEuro(totalBtw, locale)}</td>
                <td className="px-5 py-3 text-right font-normal tabular-nums sm:px-6">{formatEuro(totalNet + totalBtw, locale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="flex items-start gap-2 border-t border-border p-5 text-sm text-fg-muted sm:px-6">
          <Icons.Info className="mt-0.5 size-4 shrink-0" />
          {t("estimateFootnote", { day: settings.billingDay })}
        </p>
      </Card>
    </DashboardPage>
  );
}
