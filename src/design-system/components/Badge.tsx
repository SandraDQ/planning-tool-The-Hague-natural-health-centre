import type { ReactNode } from "react";
import { cn } from "../utils";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  accent: "bg-accent-soft text-accent-strong dark:text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Short status label. Never rely on colour alone: the text says the status. */
export function Badge({ tone = "neutral", icon, children, className }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap [&_svg]:size-3.5",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
