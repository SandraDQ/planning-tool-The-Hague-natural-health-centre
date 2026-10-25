import type { ReactNode } from "react";
import { cn } from "../utils";

/** Explains what will appear here and offers the next step (MASTER_PROMPT 8B). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      {icon && (
        <div className="mb-1 flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {description && <p className="max-w-sm text-base text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
