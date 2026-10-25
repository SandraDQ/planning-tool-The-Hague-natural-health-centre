import { useId, type ComponentProps, type ReactNode } from "react";
import { Field, controlClasses, describedBy } from "./Field";
import { cn } from "../utils";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
};

export function TextField({ id, label, hint, error, optional, className, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        required={!optional && props.required}
        className={cn(controlClasses, "min-h-12")}
        {...props}
      />
    </Field>
  );
}
