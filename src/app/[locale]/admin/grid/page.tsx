import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { RoomGrid } from "@/features/dashboard/admin/RoomGrid";
import { CalendarFeedPanel } from "@/features/calendar-feed/CalendarFeedPanel";
import { mondayOf, parseDayParam, todayLocal, weekDays, weekRange } from "@/features/dashboard/time";

export default async function AdminGridPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string; link?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("admin.grid");
  const store = getStore().admin;
  const query = await searchParams;
  const monday = mondayOf(parseDayParam(query.week) ?? todayLocal());
  const [grid, templates, therapists] = await Promise.all([
    store.roomGrid(session, weekRange(monday)),
    store.listBlockTemplates(session),
    store.listTherapists(session),
  ]);

  return (
    <DashboardPage>
      <PageHeading title={t("title")} description={t("lead")} />
      <RoomGrid
        monday={monday}
        days={weekDays(monday)}
        rooms={grid.rooms}
        blocks={grid.blocks}
        appointments={grid.appointments}
        templates={templates}
        therapists={therapists}
      />
      <section id="calendar-link" aria-labelledby="calendar-link-title" className="mt-12 max-w-reading scroll-mt-4">
        <h2 id="calendar-link-title" className="text-xl">
          {t("calendarLink")}
        </h2>
        <div className="mt-4">
          <CalendarFeedPanel session={session} status={query.link} />
        </div>
      </section>
    </DashboardPage>
  );
}
