"use client";

import { useId, type ReactNode } from "react";
import { cn } from "../utils";

export type RadioCardOption = {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned detail, e.g. price or duration. */
  meta?: ReactNode;
  disabled?: boolean;
};

type RadioCardProps = RadioCardOption & {
  name: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (value: string) => void;
};

/** One selectable card. The real radio input is visually hidden but keyboard- and screen-reader-accessible. */
export function RadioCard({ name, value, title, description, meta, disabled, checked, defaultChecked, onChange }: RadioCardProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "group relative flex min-h-11 cursor-pointer items-start gap-4 rounded-md border border-border bg-surface p-4",
        "transition-[border-color,background-color,box-shadow] duration-150 hover:border-sage",
        "has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:shadow-none",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(e) => e.target.checked && onChange?.(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong transition-colors duration-150",
          "group-has-[:checked]:border-accent",
        )}
      >
        <span className="size-2.5 scale-0 rounded-full bg-accent transition-transform duration-150 group-has-[:checked]:scale-100" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-medium text-fg">{title}</span>
        {description && <span className="text-sm text-fg-muted">{description}</span>}
      </span>
      {meta && <span className="shrink-0 text-base font-medium text-fg tabular-nums">{meta}</span>}
    </label>
  );
}

type RadioCardGroupProps = {
  legend: ReactNode;
  /** Visually hide the legend (it stays available to screen readers). */
  hideLegend?: boolean;
  name: string;
  options: RadioCardOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
};

export function RadioCardGroup({ legend, hideLegend, name, options, value, defaultValue, onChange, className }: RadioCardGroupProps) {
  return (
    <fieldset className={className}>
      <legend className={cn("mb-3 font-heading text-lg font-normal text-fg", hideLegend && "sr-only")}>{legend}</legend>
      <div className="flex flex-col gap-3">
        {options.map((o) => (
          <RadioCard
            key={o.value}
            {...o}
            name={name}
            checked={value !== undefined ? value === o.value : undefined}
            defaultChecked={defaultValue !== undefined ? defaultValue === o.value : undefined}
            onChange={onChange}
          />
        ))}
      </div>
    </fieldset>
  );
}
