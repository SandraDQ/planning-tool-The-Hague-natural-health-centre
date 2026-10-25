"use client";

import { useRef, type KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { IconButton } from "./Button";
import { ChevronLeft, ChevronRight } from "./icons";
import { cn } from "../utils";
import { dayToDate } from "../dates";

export type PickerDay = {
  /** Local date, YYYY-MM-DD (Europe/Amsterdam). */
  date: string;
  /** False when nothing can be booked on this day. */
  available: boolean;
};

type DatePickerProps = {
  days: PickerDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
};

/**
 * Week strip: seven days in a row, one tap to pick a day. Days without
 * free times stay visible but are disabled. Arrow keys move between days.
 */
export function DatePicker({
  days,
  selected,
  onSelect,
  onPreviousWeek,
  onNextWeek,
  previousDisabled,
  nextDisabled,
  className,
}: DatePickerProps) {
  const format = useFormatter();
  const t = useTranslations("design.ui");
  const listRef = useRef<HTMLDivElement>(null);

  const first = days[0] ? dayToDate(days[0].date) : null;
  const last = days.at(-1) ? dayToDate(days.at(-1)!.date) : null;
  const heading =
    first && last
      ? first.getUTCMonth() === last.getUTCMonth()
        ? format.dateTime(first, { month: "long", year: "numeric" })
        : `${format.dateTime(first, { month: "short" })} – ${format.dateTime(last, { month: "short", year: "numeric" })}`
      : "";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg capitalize" aria-live="polite">
          {heading}
        </h3>
        <div className="-mr-2 flex">
          <IconButton aria-label={t("previousWeek")} onClick={onPreviousWeek} disabled={previousDisabled || !onPreviousWeek}>
            <ChevronLeft />
          </IconButton>
          <IconButton aria-label={t("nextWeek")} onClick={onNextWeek} disabled={nextDisabled || !onNextWeek}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>
      <div ref={listRef} role="group" aria-label={t("chooseDay")} onKeyDown={onKeyDown} className="flex">
        {days.map((day) => {
          const date = dayToDate(day.date);
          const isSelected = day.date === selected;
          return (
            <button
              key={day.date}
              type="button"
              disabled={!day.available}
              aria-pressed={isSelected}
              aria-label={`${format.dateTime(date, { weekday: "long", day: "numeric", month: "long" })}${day.available ? "" : `, ${t("noTimesShort")}`}`}
              onClick={() => onSelect(day.date)}
              className={cn(
                "flex h-18 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm transition-[background-color,color] duration-150",
                isSelected ? "bg-accent text-on-accent shadow-sm" : "text-fg hover:bg-surface-2",
                !day.available && "cursor-not-allowed text-fg-muted/70 hover:bg-transparent",
              )}
            >
              <span className={cn("text-sm", isSelected ? "text-on-accent" : "text-fg-muted")}>
                {format.dateTime(date, { weekday: "short" }).replace(".", "")}
              </span>
              <span className={cn("text-lg leading-none font-semibold tabular-nums", !day.available && "line-through decoration-1")}>
                {format.dateTime(date, { day: "numeric" })}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 size-1 rounded-full",
                  day.available ? (isSelected ? "bg-on-accent" : "bg-accent") : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
