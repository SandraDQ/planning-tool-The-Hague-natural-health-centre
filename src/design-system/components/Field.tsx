import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "../utils";

export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

/** Label + control + hint/error. Used by TextField, Textarea and Select. */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const t = useTranslations("design.ui");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {optional && <span className="font-normal text-fg-muted"> ({t("optional")})</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export const controlClasses = cn(
  "block w-full rounded-sm border border-border-strong/70 bg-surface px-4 text-base text-fg",
  "placeholder:text-fg-muted transition-[border-color,box-shadow] duration-150",
  "hover:border-border-strong focus-visible:border-accent focus-visible:outline-offset-1",
  "aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70",
);
