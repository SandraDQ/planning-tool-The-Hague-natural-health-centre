"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  IconButton,
  Icons,
  SegmentedControl,
  Select,
  Sheet,
  SiteFooter,
  SiteHeader,
  TextField,
  cn,
  dayToDate,
  useToast,
  type PickerDay,
} from "@/design-system";
import { MockNote } from "../_components/MockNote";
import { freeGaps, fromMinutes, toMinutes, week, type Appointment, type CalendarDay, type RoomBlock } from "./data";

const DAY_START = 7 * 60 + 30; // timeline starts 07:30 so the first block's room label has space
const DAY_END = 18 * 60;
const PX_PER_MIN = 80 / 60; // 80px per hour on the day view
const WEEK_PX_PER_MIN = 40 / 60;

export function TherapistCalendar() {
  const t = useTranslations("design.calendar");
  const format = useFormatter();
  const toast = useToast();
  const [view, setView] = useState<"day" | "week">("day");
  const [dayIndex, setDayIndex] = useState(1); // Tuesday 3 November
  const [adding, setAdding] = useState(false);

  const day = week[dayIndex];
  const appointmentCount = day.blocks.reduce((n, b) => n + b.appointments.length, 0);
  const pickerDays: PickerDay[] = week.map((d) => ({ date: d.date, available: true }));
  const title =
    view === "day"
      ? format.dateTime(dayToDate(day.date), { weekday: "long", day: "numeric", month: "long" })
      : t("weekNumber", { number: 45 });

  const step = (delta: number) => setDayIndex((i) => Math.min(week.length - 1, Math.max(0, i + delta)));

  return (
    <>
      <SiteHeader homeHref="/design/home" bookHref="/design/choose-time" account={{ label: "Sophie de Vries", href: "/design/therapist-calendar" }} />
      <main className="mx-auto max-w-content px-gutter pt-5 pb-10 sm:pt-8 lg:pb-16">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-muted">{t("title")}</p>
            <h1 className="text-xl first-letter:uppercase">{title}</h1>
            {view === "day" && (
              <p className="mt-1 text-sm text-fg-muted">
                {t("appointments", { count: appointmentCount })} · {t("blocks", { count: day.blocks.length })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              label={t("view")}
              value={view}
              onChange={setView}
              segments={[
                { value: "day", label: t("day") },
                { value: "week", label: t("week") },
              ]}
            />
            {view === "day" && (
              <div className="ml-auto flex items-center sm:ml-0">
                <IconButton aria-label={t("previousDay")} onClick={() => step(-1)} disabled={dayIndex === 0}>
                  <Icons.ChevronLeft />
                </IconButton>
                <Button variant="ghost" className="px-3" onClick={() => setDayIndex(1)}>
                  {t("today")}
                </Button>
                <IconButton aria-label={t("nextDay")} onClick={() => step(1)} disabled={dayIndex === week.length - 1}>
                  <Icons.ChevronRight />
                </IconButton>
              </div>
            )}
            <div className="ml-2 hidden lg:block">
              <Button leadingIcon={<Icons.Plus />} onClick={() => setAdding(true)}>
                {t("addBooking")}
              </Button>
            </div>
          </div>
        </div>

        {view === "day" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
            <div className="min-w-0">
              <DatePicker
                days={pickerDays}
                selected={day.date}
                onSelect={(d) => setDayIndex(week.findIndex((w) => w.date === d))}
                previousDisabled
                nextDisabled
                className="mb-4 lg:hidden"
              />
              <Card padded={false} className="p-3 sm:p-5">
                {day.blocks.length === 0 ? (
                  <EmptyState
                    icon={<Icons.CalendarIcon />}
                    title={t("nothingTitle")}
                    description={t("nothingText")}
                    action={<Button variant="secondary">{t("reserveBlock")}</Button>}
                  />
                ) : (
                  <DayTimeline day={day} />
                )}
              </Card>
            </div>
            <aside className="hidden flex-col gap-4 lg:flex">
              <Card padded={false} className="p-4">
                <DatePicker
                  days={pickerDays}
                  selected={day.date}
                  onSelect={(d) => setDayIndex(week.findIndex((w) => w.date === d))}
                  previousDisabled
                  nextDisabled
                />
              </Card>
              <Legend />
            </aside>
          </div>
        ) : (
          <div className="mt-6">
            <WeekList onOpenDay={(i) => (setDayIndex(i), setView("day"))} />
            <WeekGrid onOpenDay={(i) => (setDayIndex(i), setView("day"))} />
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted lg:hidden">
          <Icons.Info className="mt-0.5 size-4 shrink-0" />
          {t("privacyNote")}
        </p>
      </main>

      {/* Phone: one primary action within thumb reach */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-header px-gutter pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <Button size="lg" fullWidth leadingIcon={<Icons.Plus />} onClick={() => setAdding(true)}>
          {t("addBooking")}
        </Button>
      </div>
      <MockNote />
      <SiteFooter />

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={t("addTitle")}
        description={t("addText")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                setAdding(false);
                toast.show({ title: t("saved"), description: t("savedText"), tone: "success" });
              }}
            >
              {t("save")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <TextField label={t("clientName")} autoComplete="off" />
          <Select
            label={t("service")}
            defaultValue="acuFirst"
            options={[
              { value: "acuFirst", label: t("services.acuFirst") },
              { value: "acuFollow", label: t("services.acuFollow") },
              { value: "short", label: t("services.short") },
            ]}
          />
          <Select
            label={t("startTime")}
            defaultValue="15:15"
            options={["15:15", "15:30", "15:45"].map((v) => ({ value: v, label: v }))}
          />
        </div>
      </Sheet>
    </>
  );
}

function Legend() {
  const t = useTranslations("design.calendar");
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
      <p className="flex items-start gap-2 border-t border-border pt-3 text-fg-muted">
        <Icons.Info className="mt-0.5 size-4 shrink-0" />
        {t("privacyNote")}
      </p>
    </Card>
  );
}

function DayTimeline({ day }: { day: CalendarDay }) {
  const hours: number[] = [];
  for (let m = Math.ceil(DAY_START / 60) * 60; m <= DAY_END; m += 60) hours.push(m);
  const y = (m: number) => (m - DAY_START) * PX_PER_MIN;

  return (
    <div className="relative" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN + 8 }}>
      {/* hour grid */}
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: y(m) }}>
          <span className="w-12 -translate-y-1/2 pr-2 text-right text-sm text-fg-muted tabular-nums sm:w-14">{fromMinutes(m)}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ))}
      {/* room blocks with appointments */}
      <ol className="absolute inset-y-0 right-0 left-12 sm:left-14">
        {day.blocks.map((block) => (
          <BlockView key={`${block.room}-${block.start}`} block={block} y={y} />
        ))}
      </ol>
    </div>
  );
}

function BlockView({ block, y }: { block: RoomBlock; y: (m: number) => number }) {
  const t = useTranslations("design.calendar");
  const top = y(toMinutes(block.start));
  const height = y(toMinutes(block.end)) - top;
  const label = t("blockLabel", { number: block.room, start: block.start, end: block.end });
  return (
    <li className="absolute inset-x-0" style={{ top, height }} aria-label={label}>
      {/* room label sits on a tab just above the block */}
      <span className="absolute -top-7 left-1 inline-flex h-6 items-center rounded-t-xs bg-accent-soft px-2.5 text-sm font-medium text-accent-strong dark:text-accent">
        {label}
      </span>
      <div className="absolute inset-0 rounded-sm rounded-tl-none border border-accent/25 bg-accent-soft/70" />
      <ol>
        {block.appointments.map((a) => (
          <AppointmentView key={a.start} a={a} top={y(toMinutes(a.start)) - top} height={y(toMinutes(a.end)) - y(toMinutes(a.start))} />
        ))}
        {freeGaps(block).map((g) => (
          <li
            key={g.start}
            className="absolute inset-x-2 flex items-center justify-center rounded-xs border border-dashed border-accent/50 px-3 text-center text-sm text-accent-strong dark:text-accent"
            style={{ top: y(g.start) - top + 4, height: y(g.end) - y(g.start) - 8 }}
          >
            <span>
              <span className="font-medium">
                {t("free")} {fromMinutes(g.start)}–{fromMinutes(g.end)}
              </span>
              {g.fits > 0 && <span className="block">{t("fits", { count: g.fits })}</span>}
            </span>
          </li>
        ))}
      </ol>
    </li>
  );
}

function AppointmentView({ a, top, height }: { a: Appointment; top: number; height: number }) {
  const t = useTranslations("design.calendar");
  const compact = height < 64;
  return (
    <li
      className={cn(
        "absolute inset-x-2 overflow-hidden rounded-xs border border-l-4 bg-surface px-3 shadow-sm",
        a.status === "held" ? "border-dashed border-warning/60 border-l-warning" : "border-border border-l-accent",
        compact ? "flex items-center gap-2 py-1" : "py-2",
      )}
      style={{ top: top + 2, height: height - 4 }}
    >
      <div className={cn("flex min-w-0 items-baseline gap-2", compact && "flex-1")}>
        <span className="shrink-0 text-sm text-fg-muted tabular-nums">{a.start}</span>
        <span className="shrink-0 text-base font-semibold">{a.name}</span>
        {compact && <span className="min-w-0 truncate text-sm text-fg-muted">{t(`services.${a.service}`)}</span>}
        {!compact && a.status === "held" && (
          <span className="ml-auto min-w-0 overflow-hidden">
            <Badge tone="warning">{t("held")}</Badge>
          </span>
        )}
      </div>
      {!compact && <p className="mt-0.5 truncate text-sm text-fg-muted">{t(`services.${a.service}`)}</p>}
      {a.manual && (
        <span className="hidden shrink-0 sm:block">
          <Badge tone="neutral">{t("manual")}</Badge>
        </span>
      )}
    </li>
  );
}

/** Phone week view: a calm list, one row per day. */
function WeekList({ onOpenDay }: { onOpenDay: (index: number) => void }) {
  const t = useTranslations("design.calendar");
  const format = useFormatter();
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {week.map((d, i) => {
        const date = dayToDate(d.date);
        const count = d.blocks.reduce((n, b) => n + b.appointments.length, 0);
        return (
          <li key={d.date}>
            <button
              type="button"
              onClick={() => onOpenDay(i)}
              className={cn(
                "flex min-h-16 w-full items-center gap-4 rounded-md border border-border bg-surface p-3 text-left shadow-sm transition-colors duration-150 hover:bg-surface-2",
                d.blocks.length === 0 && "shadow-none",
              )}
            >
              <span className="flex w-12 shrink-0 flex-col items-center">
                <span className="text-sm text-fg-muted">{format.dateTime(date, { weekday: "short" }).replace(".", "")}</span>
                <span className="text-lg leading-tight font-semibold tabular-nums">{format.dateTime(date, { day: "numeric" })}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {d.blocks.length === 0 ? (
                  <span className="text-sm text-fg-muted">{t("nothingTitle")}</span>
                ) : (
                  d.blocks.map((b) => (
                    <span key={b.start} className="text-sm">
                      <span className="font-medium">{t("blockLabel", { number: b.room, start: b.start, end: b.end })}</span>
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

/** Tablet/desktop week view: seven columns on a shared time scale. */
function WeekGrid({ onOpenDay }: { onOpenDay: (index: number) => void }) {
  const t = useTranslations("design.calendar");
  const format = useFormatter();
  const start = DAY_START; // leaves room for the room tab above an 08:00 block
  const y = (m: number) => (m - start) * WEEK_PX_PER_MIN;
  const hours = [8, 10, 12, 14, 16, 18].map((h) => h * 60);
  return (
    <Card padded={false} className="hidden p-5 md:block">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-2">
        <span />
        {week.map((d, i) => {
          const date = dayToDate(d.date);
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onOpenDay(i)}
              className={cn(
                "mb-3 flex min-h-11 flex-col items-center rounded-sm py-1 transition-colors duration-150 hover:bg-surface-2",
                i === 1 && "bg-accent-soft",
              )}
            >
              <span className="text-sm text-fg-muted">{format.dateTime(date, { weekday: "short" }).replace(".", "")}</span>
              <span className="text-lg leading-tight font-semibold tabular-nums">{format.dateTime(date, { day: "numeric" })}</span>
            </button>
          );
        })}
        <div className="relative" style={{ height: y(DAY_END) }}>
          {hours.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-1/2 text-sm text-fg-muted tabular-nums" style={{ top: y(m) }}>
              {fromMinutes(m)}
            </span>
          ))}
        </div>
        {week.map((d) => (
          <div key={d.date} className="relative rounded-sm bg-surface-2/50" style={{ height: y(DAY_END) }}>
            {d.blocks.map((b) => {
              const top = y(toMinutes(b.start));
              return (
                <div
                  key={b.start}
                  className="absolute inset-x-0 rounded-sm rounded-tl-none border border-accent/25 bg-accent-soft"
                  style={{ top, height: y(toMinutes(b.end)) - top }}
                  title={t("blockLabel", { number: b.room, start: b.start, end: b.end })}
                >
                  <span className="absolute -top-6 left-0 inline-flex h-6 max-w-full items-center truncate rounded-t-xs bg-accent-soft px-2 text-sm font-medium text-accent-strong dark:text-accent">
                    {t("room", { number: b.room })}
                  </span>
                  {b.appointments.map((a) => {
                    const at = y(toMinutes(a.start)) - top;
                    return (
                      <span
                        key={a.start}
                        className={cn(
                          "absolute inset-x-1 truncate rounded-xs border-l-[3px] bg-surface px-1.5 text-sm leading-5 shadow-sm",
                          a.status === "held" ? "border-l-warning" : "border-l-accent",
                        )}
                        style={{ top: at + 1, height: Math.max(20, y(toMinutes(a.end)) - y(toMinutes(a.start)) - 2) }}
                      >
                        {a.name}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
