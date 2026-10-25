import type { ReactNode } from "react";

/** Title block at the top of a dashboard page: one heading, a short line, and the page's actions. */
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-fg-muted">{eyebrow}</p>}
        <h1 className="text-xl first-letter:uppercase">{title}</h1>
        {description && <p className="mt-1 max-w-reading text-base text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard page container for the dashboards. */
export function DashboardPage({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={narrow ? "mx-auto max-w-3xl px-gutter pt-6 pb-12 sm:pt-8" : "mx-auto max-w-content px-gutter pt-6 pb-12 sm:pt-8"}>
      {children}
    </div>
  );
}
