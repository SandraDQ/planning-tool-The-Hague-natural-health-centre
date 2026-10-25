"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "./EmptyState";
import { Clock } from "./icons";
import { cn } from "../utils";

/** Start time in local time, "HH:mm". */
export type Slot = string;

type TimeSlotPickerProps = {
  slots: Slot[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
  /** Shown when there are no slots (e.g. a button to jump to the next free day). */
  emptyAction?: ReactNode;
  className?: string;
};

function part(slot: Slot): "morning" | "afternoon" | "evening" {
  const hour = Number(slot.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Free start times for one day, grouped into morning, afternoon and evening. */
export function TimeSlotPicker({ slots, selected, onSelect, emptyAction, className }: TimeSlotPickerProps) {
  const t = useTranslations("design.ui");
  const baseId = useId();

  if (slots.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<Clock />}
        title={t("noTimesTitle")}
        description={t("noTimesText")}
        action={emptyAction}
      />
    );
  }

  const groups = (["morning", "afternoon", "evening"] as const)
    .map((key) => ({ key, items: slots.filter((s) => part(s) === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {groups.map((group) => {
        const headingId = `${baseId}-${group.key}`;
        return (
          <div key={group.key} role="group" aria-labelledby={headingId}>
            <h4 id={headingId} className="mb-2 text-sm font-medium text-fg-muted">
              {t(group.key)}
            </h4>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.items.map((slot) => {
                const active = slot === selected;
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect(slot)}
                    className={cn(
                      "min-h-12 rounded-sm border text-base font-medium tabular-nums transition-[background-color,border-color,color] duration-150",
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-border bg-surface text-fg hover:border-accent hover:bg-accent-soft",
                    )}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
