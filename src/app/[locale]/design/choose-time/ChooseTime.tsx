"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Avatar,
  ButtonLink,
  Card,
  DatePicker,
  Icons,
  ProgressSteps,
  SiteFooter,
  SiteHeader,
  TimeSlotPicker,
  dayToDate,
  type PickerDay,
} from "@/design-system";
import { Link } from "@/i18n/navigation";
import { MockNote } from "../_components/MockNote";

// Made-up availability for the mock-up.
const weeks: PickerDay[][] = [
  [
    { date: "2026-11-02", available: true },
    { date: "2026-11-03", available: true },
    { date: "2026-11-04", available: false },
    { date: "2026-11-05", available: true },
    { date: "2026-11-06", available: true },
    { date: "2026-11-07", available: true },
    { date: "2026-11-08", available: false },
  ],
  [
    { date: "2026-11-09", available: true },
    { date: "2026-11-10", available: false },
    { date: "2026-11-11", available: true },
    { date: "2026-11-12", available: true },
    { date: "2026-11-13", available: false },
    { date: "2026-11-14", available: true },
    { date: "2026-11-15", available: false },
  ],
];

const slotsByDay: Record<string, string[]> = {
  "2026-11-02": ["13:00", "14:15", "15:30"],
  "2026-11-03": ["08:00", "09:15", "10:30", "13:00", "14:15", "15:30", "18:00", "19:15"],
  "2026-11-05": ["08:30", "09:45", "11:00"],
  "2026-11-06": ["13:00", "14:15"],
  "2026-11-07": ["09:00", "10:15", "11:30"],
};

const PRICE = 8500;
const DEPOSIT = 2500;

export function ChooseTime() {
  const t = useTranslations("design.chooseTime");
  const format = useFormatter();
  const [weekIndex, setWeekIndex] = useState(0);
  const [day, setDay] = useState<string>("2026-11-03");
  const [slot, setSlot] = useState<string | null>("10:30");

  const steps = [t("steps.therapist"), t("steps.session"), t("steps.time"), t("steps.details"), t("steps.pay")];
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const slots = slotsByDay[day] ?? [];
  const chosen = slot
    ? t("selected", { date: format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" }), time: slot })
    : null;

  const selectDay = (d: string) => {
    setDay(d);
    setSlot(null);
  };
  const nextFreeDay = () => {
    const all = weeks.flat();
    const next = all.find((d) => d.date > day && d.available);
    if (!next) return;
    setWeekIndex(weeks.findIndex((w) => w.some((x) => x.date === next.date)));
    selectDay(next.date);
  };

  return (
    <>
      <SiteHeader homeHref="/design/home" bookHref="/design/choose-time" />
      <main className="mx-auto max-w-content px-gutter pt-4 pb-10 sm:pt-6 lg:pb-16">
        <Link
          href="/design/home"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-base font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
        >
          <Icons.ChevronLeft className="size-5" />
          {t("back")}
        </Link>
        <ProgressSteps steps={steps} current={2} className="mt-4 max-w-2xl" />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <h1 className="text-xl">{t("title")}</h1>
              <p className="mt-2 text-base text-fg-muted">{t("intro")}</p>
            </div>

            <Card padded={false} className="flex flex-col gap-6 p-4 sm:p-6">
              <DatePicker
                days={weeks[weekIndex]}
                selected={day}
                onSelect={selectDay}
                previousDisabled={weekIndex === 0}
                nextDisabled={weekIndex === weeks.length - 1}
                onPreviousWeek={() => setWeekIndex((i) => Math.max(0, i - 1))}
                onNextWeek={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
              />
              <div className="h-px bg-border" aria-hidden="true" />
              <TimeSlotPicker
                slots={slots}
                selected={slot}
                onSelect={setSlot}
                emptyAction={
                  <button
                    type="button"
                    onClick={nextFreeDay}
                    className="inline-flex min-h-11 items-center gap-1 rounded-sm px-3 text-base font-medium text-accent hover:bg-accent-soft"
                  >
                    {t("nextFree")}
                    <Icons.ChevronRight className="size-5" />
                  </button>
                }
              />
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Icons.Info className="size-4 shrink-0" />
                {t("timezone")}
              </p>
            </Card>
          </div>

          {/* Summary: what you book and what you pay, always in view */}
          <aside className="lg:sticky lg:top-6 lg:self-start" aria-labelledby="summary-title">
            <Card className="flex flex-col gap-5">
              <h2 id="summary-title" className="text-lg">
                {t("summaryTitle")}
              </h2>
              <div className="flex items-center gap-3">
                <Avatar name="Sophie de Vries" />
                <div className="min-w-0">
                  <p className="text-base font-semibold">Sophie de Vries</p>
                  <p className="text-sm text-fg-muted">{t("service")}</p>
                </div>
              </div>
              <dl className="flex flex-col gap-3 text-base">
                <div className="flex items-start gap-3">
                  <Icons.Clock className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                  <dt className="sr-only">{t("when")}</dt>
                  <dd>
                    <span className={chosen ? "block font-medium first-letter:uppercase" : "block text-fg-muted"}>{chosen ?? t("noTime")}</span>
                    <span className="block text-sm text-fg-muted">{t("duration", { minutes: 60 })}</span>
                  </dd>
                </div>
                <div className="flex items-start gap-3">
                  <Icons.MapPin className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                  <dt className="sr-only">{t("locationLabel")}</dt>
                  <dd>{t("location")}</dd>
                </div>
              </dl>
              <dl className="flex flex-col gap-2 border-t border-border pt-4 text-base">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{t("price")}</dt>
                  <dd className="tabular-nums">{euro(PRICE)}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>{t("depositNow")}</dt>
                  <dd className="tabular-nums">{euro(DEPOSIT)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{t("balance")}</dt>
                  <dd className="tabular-nums">{euro(PRICE - DEPOSIT)}</dd>
                </div>
              </dl>
              <ul className="flex flex-col gap-2 rounded-md bg-surface-2 p-4 text-sm text-fg-muted">
                <li className="flex gap-2">
                  <Icons.Check className="size-4 shrink-0 translate-y-0.5 text-success" />
                  {t("balanceNote")}
                </li>
                <li className="flex gap-2">
                  <Icons.Check className="size-4 shrink-0 translate-y-0.5 text-success" />
                  {t("policy")}
                </li>
                <li className="flex gap-2">
                  <Icons.Check className="size-4 shrink-0 translate-y-0.5 text-success" />
                  {t("hold")}
                </li>
              </ul>
              <div className="hidden lg:block">
                <ButtonLink href="/design/choose-time" size="lg" fullWidth aria-disabled={!slot} tabIndex={slot ? undefined : -1}>
                  {t("continue")}
                </ButtonLink>
              </div>
            </Card>
          </aside>
        </div>
      </main>

      {/* Phone: the one primary action stays within thumb reach */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-header px-gutter pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-content items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg first-letter:uppercase">{chosen ?? t("noTime")}</p>
            <p className="text-sm text-fg-muted">
              {t("depositNow")} {euro(DEPOSIT)}
            </p>
          </div>
          <ButtonLink href="/design/choose-time" size="lg" aria-disabled={!slot} tabIndex={slot ? undefined : -1}>
            {t("continue")}
          </ButtonLink>
        </div>
      </div>
      <MockNote />
      <SiteFooter />
    </>
  );
}
