"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "../utils";

export type AppNavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** "exact" for a section's home (e.g. "/therapist"), "prefix" (default) for the rest. */
  match?: "exact" | "prefix";
};

export function isNavItemActive(pathname: string, item: AppNavItem) {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Phone tab bar for the dashboards: 3–5 destinations pinned to the bottom,
 * within thumb reach (MASTER_PROMPT 8A). Hidden from `lg` up, where <SectionNav> is shown.
 * Pages using it need bottom padding (pb-24 lg:pb-0) so content is never hidden behind it.
 */
export function BottomNav({ items, label, className }: { items: AppNavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-header pb-[env(safe-area-inset-bottom)] lg:hidden",
        className,
      )}
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isNavItemActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-15 flex-col items-center justify-center gap-0.5 px-1 text-sm transition-colors duration-150 [&_svg]:size-6",
                  active ? "font-normal text-accent" : "text-fg-muted hover:text-fg",
                )}
              >
                {item.icon}
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Horizontal section menu for the dashboards' header (desktop), styled like the
 * site's menu: Lato Light, current page in green and underlined.
 */
export function SectionNav({ items, label, className }: { items: AppNavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap items-center gap-x-1">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-base font-light whitespace-nowrap transition-colors duration-150 hover:text-accent [&_svg]:size-5",
                  active ? "text-accent underline decoration-1 underline-offset-8" : "text-fg",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
