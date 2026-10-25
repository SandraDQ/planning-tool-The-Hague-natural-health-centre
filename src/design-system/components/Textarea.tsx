import { useId, type ComponentProps, type ReactNode } from "react";
import { Field, controlClasses, describedBy } from "./Field";
import { cn } from "../utils";

type TextareaProps = Omit<ComponentProps<"textarea">, "id"> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
};

export function Textarea({ id, label, hint, error, optional, className, rows = 4, ...props }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cn(controlClasses, "min-h-28 resize-y py-3")}
        {...props}
      />
    </Field>
  );
}
