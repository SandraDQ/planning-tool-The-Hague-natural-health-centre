"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconButton } from "./Button";
import { Menu, ChevronRight } from "./icons";
import { Sheet } from "./Sheet";

export type NavItem = { href: string; label: string };

/** Phone navigation: a menu button that opens the links in a bottom sheet. */
export function HeaderMenu({ nav, className }: { nav: NavItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("design.ui");
  return (
    <>
      <IconButton aria-label={t("menu")} aria-expanded={open} onClick={() => setOpen(true)} className={className}>
        <Menu />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("menu")}>
        <ul className="-mx-2 flex flex-col pb-4">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-13 items-center justify-between rounded-sm px-2 text-lg text-fg hover:bg-surface-2"
              >
                {item.label}
                <ChevronRight className="size-5 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
