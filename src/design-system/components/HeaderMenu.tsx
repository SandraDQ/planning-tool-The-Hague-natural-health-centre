"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { IconButton } from "./Button";
import { Menu, ChevronRight } from "./icons";
import { Sheet } from "./Sheet";
import { cn } from "../utils";

export type NavItem = { href: string; label: string };

/**
 * Phone navigation: a menu button that opens the links in a bottom sheet.
 * `extra` is shown under the links (e.g. log in + language switch).
 */
export function HeaderMenu({ nav, extra, className }: { nav: NavItem[]; extra?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("design.ui");
  const pathname = usePathname();
  return (
    <>
      <IconButton aria-label={t("menu")} aria-expanded={open} onClick={() => setOpen(true)} className={className}>
        <Menu />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("menu")}>
        <ul className="-mx-2 flex flex-col pb-2">
          {nav.map((item) => {
            const current = item.href === pathname;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex min-h-13 items-center justify-between rounded-sm px-2 text-lg hover:bg-surface-2",
                    current ? "text-accent" : "text-fg",
                  )}
                >
                  {item.label}
                  <ChevronRight className="size-5 text-fg-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
        {extra && <div className="-mx-2 flex flex-col gap-1 border-t border-border pt-3 pb-4">{extra}</div>}
      </Sheet>
    </>
  );
}
