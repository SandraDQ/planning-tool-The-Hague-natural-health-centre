"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { NavItem } from "./HeaderMenu";
import { cn } from "../utils";

/** Desktop row of the site's main menu (Lato Light, like the current site). Marks the current page. */
export function SiteNavLinks({ nav, label, className }: { nav: NavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-x-2 xl:gap-x-5">
        {nav.map((item) => {
          const current = item.href === pathname;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center px-3 text-base font-light tracking-[0.02em] underline-offset-[10px] transition-colors duration-150",
                  "decoration-1 hover:text-accent hover:underline",
                  current ? "text-accent underline" : "text-fg",
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
