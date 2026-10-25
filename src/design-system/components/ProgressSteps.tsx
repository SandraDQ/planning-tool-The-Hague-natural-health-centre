import { useTranslations } from "next-intl";
import { Check } from "./icons";
import { cn } from "../utils";

/**
 * Booking progress. Phones show "Step 3 of 5 · Choose a time" and a bar;
 * wider screens show every step by name.
 */
export function ProgressSteps({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  const t = useTranslations("design.ui");
  return (
    <nav aria-label={t("progress")} className={className}>
      <div className="sm:hidden">
        <p className="mb-2 text-sm text-fg-muted">
          {t("stepOf", { current: current + 1, total: steps.length })}
          <span aria-hidden="true"> · </span>
          <span className="font-medium text-fg">{steps[current]}</span>
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full", i <= current ? "bg-accent" : "bg-border")} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  done && "bg-accent text-on-accent",
                  active && "bg-accent text-on-accent ring-4 ring-accent-soft",
                  !done && !active && "border border-border-strong/60 text-fg-muted",
                )}
              >
                {done ? <Check strokeWidth={2.5} className="size-4" /> : i + 1}
                {done && <span className="sr-only">{t("stepDone")}</span>}
              </span>
              <span className={cn("text-sm whitespace-nowrap", active ? "font-semibold text-fg" : "text-fg-muted")}>{s}</span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className={cn("mx-1 h-px min-w-4 flex-1", done ? "bg-accent" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
