"use client";

import { useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DatePicker,
  EmptyState,
  IconButton,
  Icons,
  SegmentedControl,
  cn,
  dayToDate,
} from "@/design-system";
import { useRouter } from "@/i18n/navigation";
import type { Interval, Locale } from "@/lib/domain/types";
import { addDays, isoWeekNumber, localDay, localMinutes, localTime, fromMinutes, mondayOf } from "../time";
import { sessionsInBlock } from "../sessions";
import type { CalendarAppointment, CalendarData, CalendarWindow } from "./calendar-data";
import { AppointmentSheet } from "./AppointmentSheet";
import { ManualBookingSheet } from "./ManualBookingSheet";

const PX_PER_MIN = 96 / 60;
const WEEK_PX_PER_MIN = 40 / 60;
const SHOWN = new Set(["held", "confirmed", "no_show", "completed"]);
const LIVE = new Set(["held", "confirmed"]);

export function TherapistCalendar({ data, initialDay, today }: { data: CalendarData; initialDay: string; today: string }) {
  const t = useTranslations("therapist.calendar");
  const format = useFormatter();
  const router = useRouter();
  const [view, setView] = useState<"day" | "week">("day");
  const [day, setDay] = useState(data.days.includes(initialDay) ? initialDay : data.days[0]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const shortest = useMemo(() => {
    const live = new Set(data.services.filter((s) => !s.archived).map((s) => s.id));
    const durations = data.sessionTypes.filter((st) => live.has(st.serviceId)).map((st) => st.durationMin);
    return durations.length ? Math.min(...durations) : 60;
  }, [data.services, data.sessionTypes]);

  const windowsOf = (d: string) => data.windows.filter((w) => w.day === d);
  const apptsOf = (d: string) => data.appointments.filter((a) => localDay(a.session.start) === d);
  const open = data.appointments.find((a) => a.id === openId) ?? null;

  const goTo = (d: string) => {
    if (data.days.includes(d)) setDay(d);
    else router.push({ pathname: "/therapist", query: { week: mondayOf(d), day: d } });
  };
  const goWeek = (delta: number) => {
    const d = addDays(data.monday, delta * 7);
    router.push({ pathname: "/therapist", query: { week: d, day: d } });
  };

  const dayAppts = apptsOf(day).filter((a) => SHOWN.has(a.status));
  const cancelled = apptsOf(day).filter((a) => a.status === "cancelled").length;
  const title =
    view === "day"
      ? format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })
      : t("weekNumber", { number: isoWeekNumber(data.monday) });

  return (
    <div className="mx-auto max-w-content px-gutter pt-5 pb-10 sm:pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg-muted">{t("title")}</p>
          <h1 className="text-xl first-letter:uppercase">{title}</h1>
          {view === "day" && (
            <p className="mt-1 text-sm text-fg-muted">
              {t("appointments", { count: dayAppts.filter((a) => LIVE.has(a.status)).length })} ·{" "}
              {t("windows", { count: windowsOf(day).length })}
              {cancelled > 0 && <> · {t("cancelledCount", { count: cancelled })}</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label={t("view")}
            value={view}
            onChange={setView}
            segments={[
              { value: "day", label: t("day") },
              { value: "week", label: t("week") },
            ]}
          />
          <div className="ml-auto flex items-center sm:ml-0">
            <IconButton
              aria-label={view === "day" ? t("previousDay") : t("previousWeek")}
              onClick={() => (view === "day" ? goTo(addDays(day, -1)) : goWeek(-1))}
            >
              <Icons.ChevronLeft />
            </IconButton>
            <Button variant="ghost" className="px-3" onClick={() => goTo(today)}>
              {t("today")}
            </Button>
            <IconButton
              aria-label={view === "day" ? t("nextDay") : t("nextWeek")}
              onClick={() => (view === "day" ? goTo(addDays(day, 1)) : goWeek(1))}
            >
              <Icons.ChevronRight />
            </IconButton>
          </div>
          <div className="hidden lg:block">
            <Button leadingIcon={<Icons.Plus />} onClick={() => setAdding(true)}>
              {t("addBooking")}
            </Button>
          </div>
        </div>
      </div>

      {view === "day" ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <div className="min-w-0">
            <DatePicker
              days={data.days.map((d) => ({ date: d, available: true }))}
              selected={day}
              onSelect={setDay}
              onPreviousWeek={() => goWeek(-1)}
              onNextWeek={() => goWeek(1)}
              className="mb-4 lg:hidden"
            />
            <Card padded={false} className="p-3 sm:p-5">
              {windowsOf(day).length === 0 && dayAppts.length === 0 ? (
                <EmptyState
                  icon={<Icons.CalendarIcon />}
                  title={t("nothingTitle")}
                  description={data.privateRoom ? t("nothingTextPrivate") : t("nothingText")}
                  action={
                    <ButtonLink href="/therapist/blocks" variant="secondary">
                      {t("reserveBlock")}
                    </ButtonLink>
                  }
                />
              ) : (
                <DayTimeline
                  windows={windowsOf(day)}
                  appointments={dayAppts}
                  timeOff={data.timeOff}
                  day={day}
                  shortest={shortest}
                  buffer={data.bufferMinutes}
                  onOpen={setOpenId}
                />
              )}
            </Card>
          </div>
          <aside className="hidden flex-col gap-4 lg:flex">
            <Card padded={false} className="p-4">
              <DatePicker
                days={data.days.map((d) => ({ date: d, available: true }))}
                selected={day}
                onSelect={setDay}
                onPreviousWeek={() => goWeek(-1)}
                onNextWeek={() => goWeek(1)}
              />
            </Card>
            <Legend />
          </aside>
        </div>
      ) : (
        <div className="mt-6">
          <WeekList data={data} today={today} onOpenDay={(d) => (setDay(d), setView("day"))} />
          <WeekGrid data={data} today={today} onOpenDay={(d) => (setDay(d), setView("day"))} onOpen={setOpenId} />
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted lg:hidden">
        <Icons.Info className="mt-0.5 size-4 shrink-0" />
        {t("privacyNote")}
      </p>

      {/* Phone: the one primary action, just above the tab bar */}
      <div className="fixed right-gutter bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <Button size="lg" leadingIcon={<Icons.Plus />} onClick={() => setAdding(true)} className="shadow-lg">
          {t("addBookingShort")}
        </Button>
      </div>

      {open && <AppointmentSheet appointment={open} today={today} onClose={() => setOpenId(null)} />}
      {adding && <ManualBookingSheet data={data} initialDay={day} onClose={() => setAdding(false)} />}
    </div>
  );
}

function Legend() {
  const t = useTranslations("therapist.calendar");
  return (
    <Card className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="h-5 w-8 rounded-xs border border-accent/30 bg-accent-soft" aria-hidden="true" />
        {t("legendBlock")}
      </div>
      <div className="flex items-center gap-3">
        <span className="h-5 w-8 rounded-xs border border-border border-l-4 border-l-accent bg-surface shadow-sm" aria-hidden="true" />
        {t("legendAppointment")}
      </div>
      <div className="flex items-center gap-3">
        <span className="h-5 w-8 rounded-xs border border-dashed border-warning/60 border-l-4 border-l-warning bg-surface" aria-hidden="true" />
        {t("legendHeld")}
      </div>
      <p className="flex items-start gap-2 border-t border-border pt-3 text-fg-muted">
        <Icons.Info className="mt-0.5 size-4 shrink-0" />
        {t("privacyNote")}
      </p>
    </Card>
  );
}

/** Minutes since local midnight, clamped to the day (windows may run to midnight). */
function minutesOn(iso: string, day: string) {
  const d = localDay(iso);
  if (d < day) return 0;
  if (d > day) return 24 * 60;
  return localMinutes(iso);
}

function freeGaps(w: CalendarWindow, appts: CalendarAppointment[], day: string) {
  const busy = appts
    .filter((a) => LIVE.has(a.status) && a.occupied.start < w.end && a.occupied.end > w.start)
    .map((a) => [minutesOn(a.occupied.start, day), minutesOn(a.occupied.end, day)] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps: { start: number; end: number }[] = [];
  let cursor = minutesOn(w.start, day);
  const end = minutesOn(w.end, day);
  for (const [s, e] of busy) {
    if (s > cursor) gaps.push({ start: cursor, end: Math.min(s, end) });
    cursor = Math.max(cursor, e);
  }
  if (end > cursor) gaps.push({ start: cursor, end });
  return gaps;
}

function DayTimeline({
  windows,
  appointments,
  timeOff,
  day,
  shortest,
  buffer,
  onOpen,
}: {
  windows: CalendarWindow[];
  appointments: CalendarAppointment[];
  timeOff: Interval[];
  day: string;
  shortest: number;
  buffer: number;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("therapist.calendar");
  const starts = [...windows.map((w) => minutesOn(w.start, day)), ...appointments.map((a) => minutesOn(a.session.start, day))];
  const ends = [...windows.map((w) => minutesOn(w.end, day)), ...appointments.map((a) => minutesOn(a.occupied.end, day))];
  const dayStart = Math.min(8 * 60, Math.floor((Math.min(...starts) - 30) / 60) * 60 + 30);
  const dayEnd = Math.max(12 * 60, Math.ceil(Math.max(...ends) / 60) * 60);
  const y = (m: number) => (m - dayStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hours.push(m);
  const offs = timeOff
    .filter((p) => localDay(p.start) <= day && localDay(p.end) >= day)
    .map((p) => ({ start: Math.max(dayStart, minutesOn(p.start, day)), end: Math.min(dayEnd, minutesOn(p.end, day)) }))
    .filter((p) => p.end > p.start);

  return (
    <div className="relative" style={{ height: (dayEnd - dayStart) * PX_PER_MIN + 8 }}>
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: y(m) }}>
          <span className="w-12 -translate-y-1/2 pr-2 text-right text-sm text-fg-muted tabular-nums sm:w-14">{fromMinutes(m)}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ))}
      <div className="absolute inset-y-0 right-0 left-12 sm:left-14">
        {offs.map((o, i) => (
          <div
            key={i}
            className="absolute inset-x-0 flex items-start justify-end rounded-sm bg-surface-2 bg-[repeating-linear-gradient(135deg,transparent_0_8px,var(--thn-sand)_8px_10px)] p-2 text-sm text-fg-muted"
            style={{ top: y(o.start), height: y(o.end) - y(o.start) }}
          >
            {t("timeOff")}
          </div>
        ))}
        <ol>
          {windows.map((w) => {
            const top = y(minutesOn(w.start, day));
            const height = y(minutesOn(w.end, day)) - top;
            const label =
              w.kind === "block"
                ? t("blockLabel", { number: w.roomNumber, start: localTime(w.start), end: localTime(w.end) })
                : t("hoursLabel", { number: w.roomNumber, start: localTime(w.start), end: localTime(w.end) });
            return (
              <li key={w.key} className="absolute inset-x-0" style={{ top, height }} aria-label={label}>
                <span className="absolute -top-7 left-1 inline-flex h-6 max-w-[calc(100%-0.5rem)] items-center gap-1.5 truncate rounded-t-xs bg-accent-soft px-2.5 text-sm font-medium text-accent-strong dark:text-accent">
                  {w.seriesId && <Icons.Repeat className="size-3.5 shrink-0" />}
                  {label}
                </span>
                <div className="absolute inset-0 rounded-sm rounded-tl-none border border-accent/25 bg-accent-soft/70" />
                <ol>
                  {freeGaps(w, appointments, day)
                    .filter((g) => g.end - g.start >= shortest)
                    .map((g) => {
                      const fits = sessionsInBlock(g.end - g.start, shortest, buffer);
                      return (
                        <li
                          key={g.start}
                          className="absolute inset-x-2 flex items-center justify-center rounded-xs border border-dashed border-accent/50 px-3 text-center text-sm text-accent-strong dark:text-accent"
                          style={{ top: y(g.start) - top + 4, height: Math.max(24, y(g.end) - y(g.start) - 8) }}
                        >
                          <span>
                            <span className="font-medium">
                              {t("free")} {fromMinutes(g.start)}–{fromMinutes(g.end)}
                            </span>
                            {fits > 0 && y(g.end) - y(g.start) > 56 && <span className="block">{t("fits", { count: fits, minutes: shortest })}</span>}
                          </span>
                        </li>
                      );
                    })}
                </ol>
              </li>
            );
          })}
        </ol>
        <ol>
          {appointments.map((a) => {
            const s = minutesOn(a.session.start, day);
            const e = minutesOn(a.session.end, day);
            return <AppointmentCard key={a.id} a={a} top={y(s)} height={Math.max(40, y(e) - y(s))} onOpen={() => onOpen(a.id)} />;
          })}
        </ol>
      </div>
    </div>
  );
}

function AppointmentCard({ a, top, height, onOpen }: { a: CalendarAppointment; top: number; height: number; onOpen: () => void }) {
  const t = useTranslations("therapist.calendar");
  const locale = useLocale() as Locale;
  const compact = height < 64;
  const name = a.client?.firstName ?? t("client");
  const service = a.snapshot.sessionTypeName[locale] || a.snapshot.serviceName[locale];
  return (
    <li className="absolute inset-x-2" style={{ top: top + 2, height: height - 4 }}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "h-full w-full overflow-hidden rounded-xs border border-l-4 bg-surface px-3 text-left shadow-sm transition-colors duration-150 hover:bg-surface-2",
          a.status === "held" ? "border-dashed border-warning/60 border-l-warning" : "border-border border-l-accent",
          (a.status === "no_show" || a.status === "completed") && "border-l-border-strong",
          compact ? "flex items-center gap-2 py-1" : "py-2",
        )}
      >
        <span className={cn("flex min-w-0 items-baseline gap-2", compact && "flex-1")}>
          <span className="shrink-0 text-sm text-fg-muted tabular-nums">{localTime(a.session.start)}</span>
          <span className="shrink-0 text-base font-normal">{name}</span>
          {compact && <span className="min-w-0 truncate text-sm text-fg-muted">{service}</span>}
          {!compact && <StatusBadge a={a} className="ml-auto" />}
        </span>
        {!compact && (
          <span className="mt-0.5 flex items-center gap-2 text-sm text-fg-muted">
            <span className="truncate">{service}</span>
            {a.source === "manual" && <Badge tone="neutral">{t("manual")}</Badge>}
          </span>
        )}
        {compact && <StatusBadge a={a} />}
      </button>
    </li>
  );
}

export function StatusBadge({ a, className }: { a: { status: string }; className?: string }) {
  const t = useTranslations("therapist.calendar.status");
  if (a.status === "confirmed") return null;
  const tone = a.status === "held" ? "warning" : a.status === "cancelled" ? "danger" : "neutral";
  return (
    <span className={cn("min-w-0 shrink-0 overflow-hidden", className)}>
      <Badge tone={tone}>{t(a.status as "held")}</Badge>
    </span>
  );
}

function WeekList({ data, today, onOpenDay }: { data: CalendarData; today: string; onOpenDay: (d: string) => void }) {
  const t = useTranslations("therapist.calendar");
  const format = useFormatter();
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {data.days.map((d) => {
        const date = dayToDate(d);
        const windows = data.windows.filter((w) => w.day === d);
        const count = data.appointments.filter((a) => LIVE.has(a.status) && localDay(a.session.start) === d).length;
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onOpenDay(d)}
              className={cn(
                "flex min-h-16 w-full items-center gap-4 rounded-md border border-border bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-2",
                d === today && "border-accent",
              )}
            >
              <span className="flex w-12 shrink-0 flex-col items-center">
                <span className="text-sm text-fg-muted">{format.dateTime(date, { weekday: "short" }).replace(".", "")}</span>
                <span className="font-heading text-lg leading-tight tabular-nums">{format.dateTime(date, { day: "numeric" })}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {windows.length === 0 ? (
                  <span className="text-sm text-fg-muted">{t("nothingTitle")}</span>
                ) : (
                  windows.map((w) => (
                    <span key={w.key} className="text-sm font-medium">
                      {w.kind === "block"
                        ? t("blockLabel", { number: w.roomNumber, start: localTime(w.start), end: localTime(w.end) })
                        : t("hoursLabel", { number: w.roomNumber, start: localTime(w.start), end: localTime(w.end) })}
                    </span>
                  ))
                )}
                {count > 0 && <span className="text-sm text-fg-muted">{t("appointments", { count })}</span>}
              </span>
              <Icons.ChevronRight className="size-5 shrink-0 text-fg-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function WeekGrid({
  data,
  today,
  onOpenDay,
  onOpen,
}: {
  data: CalendarData;
  today: string;
  onOpenDay: (d: string) => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("therapist.calendar");
  const format = useFormatter();
  const startsAll = [...data.windows.map((w) => minutesOn(w.start, w.day)), ...data.appointments.map((a) => localMinutes(a.session.start))];
  const endsAll = [...data.windows.map((w) => minutesOn(w.end, w.day)), ...data.appointments.map((a) => localMinutes(a.session.end))];
  const start = Math.min(7 * 60 + 30, ...startsAll.map((m) => m - 30));
  const end = Math.max(18 * 60, ...endsAll);
  const y = (m: number) => (m - start) * WEEK_PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(start / 120) * 120; m <= end; m += 120) hours.push(m);

  return (
    <Card padded={false} className="hidden p-5 md:block">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-2">
        <span />
        {data.days.map((d) => {
          const date = dayToDate(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onOpenDay(d)}
              className={cn(
                "mb-3 flex min-h-11 flex-col items-center rounded-sm py-1 transition-colors duration-150 hover:bg-surface-2",
                d === today && "bg-accent-soft",
              )}
            >
              <span className="text-sm text-fg-muted">{format.dateTime(date, { weekday: "short" }).replace(".", "")}</span>
              <span className="font-heading text-lg leading-tight tabular-nums">{format.dateTime(date, { day: "numeric" })}</span>
            </button>
          );
        })}
        <div className="relative" style={{ height: y(end) }}>
          {hours.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-1/2 text-sm text-fg-muted tabular-nums" style={{ top: y(m) }}>
              {fromMinutes(m)}
            </span>
          ))}
        </div>
        {data.days.map((d) => (
          <div key={d} className="relative rounded-sm bg-surface-2/50" style={{ height: y(end) }}>
            {data.windows
              .filter((w) => w.day === d)
              .map((w) => {
                const top = y(minutesOn(w.start, d));
                return (
                  <div
                    key={w.key}
                    className="absolute inset-x-0 rounded-sm rounded-tl-none border border-accent/25 bg-accent-soft"
                    style={{ top, height: y(minutesOn(w.end, d)) - top }}
                    title={t("blockLabel", { number: w.roomNumber, start: localTime(w.start), end: localTime(w.end) })}
                  >
                    <span className="absolute -top-6 left-0 inline-flex h-6 max-w-full items-center truncate rounded-t-xs bg-accent-soft px-2 text-sm font-medium text-accent-strong dark:text-accent">
                      {t("room", { number: w.roomNumber })}
                    </span>
                  </div>
                );
              })}
            {data.appointments
              .filter((a) => SHOWN.has(a.status) && localDay(a.session.start) === d)
              .map((a) => {
                const top = y(localMinutes(a.session.start));
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpen(a.id)}
                    className={cn(
                      "absolute inset-x-1 truncate rounded-xs border-l-[3px] bg-surface px-1.5 text-left text-sm leading-5 shadow-sm hover:bg-surface-2",
                      a.status === "held" ? "border-l-warning" : "border-l-accent",
                    )}
                    style={{ top: top + 1, height: Math.max(20, y(localMinutes(a.session.end)) - top - 2) }}
                  >
                    {a.client?.firstName ?? t("client")}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </Card>
  );
}
