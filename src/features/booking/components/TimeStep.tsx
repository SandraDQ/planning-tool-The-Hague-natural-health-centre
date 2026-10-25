"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, ButtonLink, Card, DatePicker, Icons, TimeSlotPicker, cn, type PickerDay } from "@/design-system";
import { useRouter } from "@/i18n/navigation";
import { AppointmentSummary, type SummaryData } from "./AppointmentSummary";

type DaySlots = Record<string, { start: string; label: string }[]>;

/**
 * Step 2: week strip + free start times for one session type. Slots come from
 * the server (store.public.findSlots); changing week reloads the page data.
 */
export function TimeStep({
  sessionTypeId,
  days,
  slots,
  initialDay,
  previousWeekHref,
  nextWeekHref,
  summary,
}: {
  sessionTypeId: string;
  days: string[];
  slots: DaySlots;
  initialDay: string | null;
  previousWeekHref: string | null;
  nextWeekHref: string | null;
  summary: SummaryData;
}) {
  const t = useTranslations("booking.time");
  const tb = useTranslations("booking");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState<string | null>(initialDay);
  const [start, setStart] = useState<string | null>(null);

  const pickerDays: PickerDay[] = useMemo(() => days.map((d) => ({ date: d, available: (slots[d]?.length ?? 0) > 0 })), [days, slots]);
  const daySlots = day ? (slots[day] ?? []) : [];
  const selectedLabel = daySlots.find((s) => s.start === start)?.label ?? null;
  const anyThisWeek = pickerDays.some((d) => d.available);
  const nextFree = pickerDays.find((d) => d.available && (!day || d.date > day))?.date ?? null;

  const go = (href: string | null) => href && startTransition(() => router.push(href, { scroll: false }));
  const selectDay = (d: string) => {
    setDay(d);
    setStart(null);
  };
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const continueHref = start ? { pathname: "/book/details", query: { st: sessionTypeId, start } } : null;
  const chosenText = start ? t("selected", { date: format.dateTime(new Date(start), { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }), time: selectedLabel ?? "" }) : t("noTime");

  const continueButton = (size: "lg" | "md", fullWidth?: boolean) =>
    continueHref ? (
      <ButtonLink href={continueHref} size={size} fullWidth={fullWidth}>
        {t("continue")}
      </ButtonLink>
    ) : (
      <Button size={size} fullWidth={fullWidth} disabled aria-describedby="time-choose-first">
        {t("continue")}
      </Button>
    );

  const nextWeekAction = nextWeekHref ? (
    <Button variant="ghost" onClick={() => go(nextWeekHref)} trailingIcon={<Icons.ChevronRight />}>
      {t("nextWeek")}
    </Button>
  ) : null;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <Card padded={false} className={cn("flex min-w-0 flex-col gap-6 p-4 transition-opacity duration-150 sm:p-6", pending && "opacity-60")} aria-busy={pending}>
          <DatePicker
            days={pickerDays}
            selected={day}
            onSelect={selectDay}
            previousDisabled={!previousWeekHref || pending}
            nextDisabled={!nextWeekHref || pending}
            onPreviousWeek={() => go(previousWeekHref)}
            onNextWeek={() => go(nextWeekHref)}
          />
          <div className="h-px bg-border" aria-hidden="true" />
          {anyThisWeek ? (
            <TimeSlotPicker
              slots={daySlots.map((s) => s.label)}
              selected={selectedLabel}
              onSelect={(label) => setStart(daySlots.find((s) => s.label === label)?.start ?? null)}
              emptyAction={
                nextFree ? (
                  <Button variant="ghost" onClick={() => selectDay(nextFree)} trailingIcon={<Icons.ChevronRight />}>
                    {t("nextFree")}
                  </Button>
                ) : (
                  nextWeekAction
                )
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="mb-1 flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted [&_svg]:size-6">
                <Icons.CalendarIcon />
              </div>
              <h2 className="text-lg font-normal">{t("noneTitle")}</h2>
              <p className="max-w-sm text-base text-fg-muted">{t("noneText")}</p>
              {nextWeekAction}
            </div>
          )}
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Icons.Info className="size-4 shrink-0" />
            {t("intro")}
          </p>
        </Card>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <AppointmentSummary
            data={summary}
            start={start}
            footer={
              <div className="hidden lg:block">
                {continueButton("lg", true)}
                {!start && (
                  <p id="time-choose-first" className="mt-2 text-center text-sm text-fg-muted">
                    {t("chooseFirst")}
                  </p>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Phone: the one primary action stays within thumb reach */}
      <div className="sticky bottom-0 z-30 -mx-gutter border-t border-border bg-header px-gutter pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="truncate text-sm font-bold text-fg first-letter:uppercase">{chosenText}</p>
            <p className="text-sm text-fg-muted">
              {tb("summary.depositNow")} {euro(summary.depositCents)}
            </p>
          </div>
          {continueButton("lg")}
        </div>
      </div>
    </>
  );
}
