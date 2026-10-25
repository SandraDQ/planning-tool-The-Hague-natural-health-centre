"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { NavItem } from "./HeaderMenu";
import { cn } from "../utils";

/** Desktop row of the site's main menu (Lato Light 17px, like the live site). The current page is muted brown and underlined. */
export function SiteNavLinks({ nav, label, className }: { nav: NavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex items-center">
        {nav.map((item) => {
          const current = item.href === pathname;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center px-2 text-base font-light whitespace-nowrap underline-offset-[10px] transition-colors duration-150 2xl:px-2.5",
                  "decoration-1 hover:text-fg-muted",
                  current ? "text-fg-muted underline" : "text-fg",
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
