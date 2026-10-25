import { useId, type ComponentProps, type ReactNode } from "react";
import { Field, controlClasses, describedBy } from "./Field";
import { ChevronDown } from "./icons";
import { cn } from "../utils";

type Option = { value: string; label: string; disabled?: boolean };

type SelectProps = Omit<ComponentProps<"select">, "id" | "children"> & {
  id?: string;
  label: ReactNode;
  options: Option[];
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
};

/** Native select: the phone's own picker is the most accessible bottom sheet there is. */
export function Select({ id, label, options, placeholder, hint, error, optional, className, ...props }: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={cn(controlClasses, "min-h-12 appearance-none pr-11")}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-fg-muted" />
      </div>
    </Field>
  );
}
