import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, ButtonLink, Card, Icons, type BadgeTone } from "@/design-system";
import { Link } from "@/i18n/navigation";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import type { OnboardingStatus } from "@/lib/domain/types";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { Meter } from "@/features/dashboard/components/Meter";
import { dayToDate } from "@/design-system";
import { addDays, isoWeekNumber, mondayOf, todayLocal, weekRange } from "@/features/dashboard/time";
import { roomTitle } from "@/features/dashboard/rooms";

const onboardingTone: Record<OnboardingStatus, BadgeTone> = { invited: "warning", in_progress: "accent", complete: "success" };

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("admin.overview");
  const format = await getFormatter();
  const store = getStore().admin;

  const monday = mondayOf(todayLocal());
  const [grid, templates, therapists] = await Promise.all([
    store.roomGrid(session, weekRange(monday)),
    store.listBlockTemplates(session),
    store.listTherapists(session),
  ]);

  const activeTemplates = templates.filter((x) => x.active).length;
  const sharedRooms = grid.rooms.filter((r) => r.active && r.kind === "shared").sort((a, b) => a.number - b.number);
  const privateRooms = grid.rooms.filter((r) => r.active && r.kind === "private").sort((a, b) => a.number - b.number);
  const reserved = grid.blocks.filter((b) => b.status === "reserved");
  const possiblePerRoom = activeTemplates * 7;
  const totalReserved = reserved.filter((b) => sharedRooms.some((r) => r.id === b.roomId)).length;
  const totalPossible = possiblePerRoom * sharedRooms.length;
  const live = grid.appointments.filter((a) => a.status === "confirmed" || a.status === "held");
  const nameOf = new Map(therapists.map((x) => [x.id, x.displayName]));

  const weekLabel = t("week", {
    number: isoWeekNumber(monday),
    from: format.dateTime(dayToDate(monday), { day: "numeric", month: "short" }),
    to: format.dateTime(dayToDate(addDays(monday, 6)), { day: "numeric", month: "short" }),
  });

  const quick = [
    { href: "/admin/grid", icon: <Icons.Grid />, title: t("links.grid"), text: t("links.gridText") },
    { href: "/admin/rooms", icon: <Icons.Door />, title: t("links.rooms"), text: t("links.roomsText") },
    { href: "/admin/renters", icon: <Icons.Users />, title: t("links.renters"), text: t("links.rentersText") },
    { href: "/admin/rent", icon: <Icons.Euro />, title: t("links.rent"), text: t("links.rentText") },
  ];

  return (
    <DashboardPage>
      <PageHeading
        eyebrow={weekLabel}
        title={t("title", { name: session.displayName.split(" ")[0] })}
        description={t("lead")}
        actions={
          <ButtonLink href="/admin/grid" leadingIcon={<Icons.Grid />}>
            {t("openGrid")}
          </ButtonLink>
        }
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-fg-muted">{t("stats.occupancy")}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">
            {totalPossible ? Math.round((totalReserved / totalPossible) * 100) : 0}%
          </p>
          <p className="text-sm text-fg-muted">{t("stats.blocksOf", { reserved: totalReserved, possible: totalPossible })}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t("stats.appointments")}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">{live.length}</p>
          <p className="text-sm text-fg-muted">{t("stats.appointmentsText")}</p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t("stats.renters")}</p>
          <p className="mt-1 font-heading text-xl tabular-nums">{therapists.length}</p>
          <p className="text-sm text-fg-muted">
            {t("stats.rentersText", { bookable: therapists.filter((x) => x.bookable).length })}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="text-lg">{t("occupancyTitle")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("occupancyText", { blocks: activeTemplates })}</p>
          <ul className="mt-5 flex flex-col gap-4">
            {sharedRooms.map((room) => {
              const n = reserved.filter((b) => b.roomId === room.id).length;
              return (
                <li key={room.id}>
                  <Meter
                    label={roomTitle(room.number, room.name, t("roomNumber", { number: room.number }))}
                    value={n}
                    max={possiblePerRoom}
                    detail={t("blocksOf", { reserved: n, possible: possiblePerRoom })}
                  />
                </li>
              );
            })}
            {privateRooms.map((room) => (
              <li key={room.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="text-base">{roomTitle(room.number, room.name, t("roomNumber", { number: room.number }))}</span>
                <span className="text-fg-muted">
                  {room.privateTherapistId
                    ? t("privateFor", { name: nameOf.get(room.privateTherapistId) ?? "—" })
                    : t("privateUnassigned")}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">{t("onboardingTitle")}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t("onboardingText")}</p>
            </div>
            <ButtonLink href="/admin/renters" variant="ghost" size="sm">
              {t("allRenters")}
            </ButtonLink>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {therapists.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/admin/renters/${x.id}`}
                  className="flex min-h-13 items-center justify-between gap-3 py-2 hover:text-accent"
                >
                  <span className="min-w-0 truncate">{x.displayName}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!x.bookable && <Badge tone="neutral">{t("notBookable")}</Badge>}
                    <Badge tone={onboardingTone[x.onboardingStatus]}>{t(`onboarding.${x.onboardingStatus}`)}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mt-10 text-lg">{t("quickTitle")}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quick.map((q) => (
          <li key={q.href}>
            <Card as={Link} href={q.href} interactive className="flex h-full flex-col gap-2">
              <span className="text-accent [&_svg]:size-6">{q.icon}</span>
              <span className="font-heading text-lg">{q.title}</span>
              <span className="text-sm text-fg-muted">{q.text}</span>
            </Card>
          </li>
        ))}
      </ul>
    </DashboardPage>
  );
}
