import { useId, type ComponentProps, type ReactNode } from "react";
import { Check } from "./icons";
import { cn } from "../utils";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "id"> & {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
};

export function Checkbox({ id, label, description, error, className, ...props }: CheckboxProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const descId = description ? `${fieldId}-desc` : undefined;
  const errId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
        <span className="relative mt-px inline-flex size-6 shrink-0">
          <input
            id={fieldId}
            type="checkbox"
            aria-describedby={[descId, errId].filter(Boolean).join(" ") || undefined}
            aria-invalid={error ? true : undefined}
            className={cn(
              "peer size-6 cursor-pointer appearance-none rounded-xs border-2 border-border-strong bg-surface",
              "transition-colors duration-150 checked:border-accent checked:bg-accent aria-invalid:border-danger",
            )}
            {...props}
          />
          <Check
            strokeWidth={2.5}
            className="pointer-events-none absolute inset-0 m-auto size-4 text-on-accent opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
          />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-base text-fg">{label}</span>
          {description && (
            <span id={descId} className="text-sm text-fg-muted">
              {description}
            </span>
          )}
        </span>
      </label>
      {error && (
        <p id={errId} className="ml-9 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
