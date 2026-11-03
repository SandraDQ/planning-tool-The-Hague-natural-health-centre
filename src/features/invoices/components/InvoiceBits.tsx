import type { ReactNode } from "react";
import { Badge, ButtonLink, Card, Icons, buttonClasses, cn, type BadgeTone } from "@/design-system";
import type { InvoicePaymentStatus } from "@/lib/domain/types";

export const statusTone: Record<InvoicePaymentStatus, BadgeTone> = {
  paid: "success",
  open: "warning",
  overdue: "danger",
  draft: "neutral",
  credit: "neutral",
};

/** Payment status of an invoice: colour plus words, never colour alone. */
export function StatusBadge({ status, label }: { status: InvoicePaymentStatus; label: string }) {
  const icon = status === "paid" ? <Icons.Check /> : status === "overdue" ? <Icons.Alert /> : status === "open" ? <Icons.Clock /> : undefined;
  return (
    <Badge tone={statusTone[status]} icon={icon}>
      {label}
    </Badge>
  );
}

/** Opens the invoice PDF in a new tab (the browser's own viewer can save and print it). */
export function PdfLink({ invoiceId, label, ariaLabel, size = "sm", className }: { invoiceId: string; label: string; ariaLabel: string; size?: "sm" | "md"; className?: string }) {
  return (
    <a
      href={`/api/invoices/${encodeURIComponent(invoiceId)}`}
      target="_blank"
      rel="noopener"
      aria-label={ariaLabel}
      className={buttonClasses({ variant: "secondary", size, className })}
    >
      <Icons.ExternalLink />
      {label}
    </a>
  );
}

/** One big number with a label: readable at a glance. */
export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: ReactNode; tone?: "warning" | "success" }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-base text-fg-muted first-letter:uppercase">{label}</p>
      <p className={cn("text-2xl tabular-nums", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {hint && <p className="text-sm text-fg-muted">{hint}</p>}
    </Card>
  );
}

/** Previous / this / next month buttons. */
export function MonthNav({
  pathname,
  prev,
  next,
  current,
  labels,
}: {
  pathname: string;
  prev: string;
  next: string;
  /** A day in "this month", when the page may open on another month by default. */
  current?: string;
  labels: { previous: string; current: string; next: string };
}) {
  return (
    <div className="flex shrink-0 items-center">
      <ButtonLink href={{ pathname, query: { month: prev } }} variant="ghost" size="sm" aria-label={labels.previous}>
        <Icons.ChevronLeft />
      </ButtonLink>
      <ButtonLink href={current ? { pathname, query: { month: current } } : pathname} variant="ghost" size="sm">
        {labels.current}
      </ButtonLink>
      <ButtonLink href={{ pathname, query: { month: next } }} variant="ghost" size="sm" aria-label={labels.next}>
        <Icons.ChevronRight />
      </ButtonLink>
    </div>
  );
}
