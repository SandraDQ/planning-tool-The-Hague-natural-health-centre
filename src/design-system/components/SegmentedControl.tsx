"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";

type Segment<T extends string> = { value: T; label: ReactNode };

/** Two to four mutually exclusive views, e.g. Day | Week. */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  className,
}: {
  label: string;
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-sm bg-surface-2 p-1", className)}>
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={cn(
              "inline-flex min-h-11 min-w-16 items-center justify-center rounded-xs px-4 text-sm whitespace-nowrap font-medium transition-[background-color,color,box-shadow] duration-150",
              active ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
