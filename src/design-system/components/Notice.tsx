import type { ReactNode } from "react";
import { Alert, Check, Info } from "./icons";
import { cn } from "../utils";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const tones: Record<NoticeTone, { box: string; icon: string; glyph: ReactNode }> = {
  info: { box: "border-border bg-surface-2", icon: "text-accent", glyph: <Info /> },
  success: { box: "border-success/30 bg-success-soft", icon: "text-success", glyph: <Check /> },
  warning: { box: "border-warning/30 bg-warning-soft", icon: "text-warning", glyph: <Alert /> },
  danger: { box: "border-danger/30 bg-danger-soft", icon: "text-danger", glyph: <Alert /> },
};

/**
 * Inline message inside a page (unlike Toast, it stays put): a friendly
 * explanation plus, optionally, the way forward. The title says what happened
 * in words, so the colour is never the only signal.
 * Pass `role="alert"` for messages that appear after an action.
 */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  role,
  className,
  id,
  tabIndex,
}: {
  tone?: NoticeTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
  id?: string;
  tabIndex?: number;
}) {
  const t = tones[tone];
  return (
    <div id={id} role={role} tabIndex={tabIndex} className={cn("flex gap-3 rounded-md border p-4 outline-none", t.box, className)}>
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-5", t.icon)}>{t.glyph}</span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-fg">{title}</p>
        {children && <div className="mt-1 text-base text-fg">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
