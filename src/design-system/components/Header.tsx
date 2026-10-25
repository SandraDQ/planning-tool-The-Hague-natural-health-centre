import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { HeaderMenu, type NavItem } from "./HeaderMenu";
import { Logo } from "./Logo";
import { cn } from "../utils";

/**
 * Frosted sticky header: logo (links home) + optional navigation + language switch.
 * On phones the navigation moves into a menu sheet.
 */
export function Header({
  nav,
  actions,
  homeHref = "/",
  className,
}: {
  nav?: NavItem[];
  actions?: ReactNode;
  homeHref?: string;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/70 bg-header backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-gutter">
        <Link href={homeHref} className="-m-1 inline-flex min-h-11 items-center rounded-sm p-1" aria-label={t("common.centreName")}>
          <Logo height={36} />
        </Link>
        {nav && nav.length > 0 && (
          <nav aria-label={t("design.ui.mainNav")} className="ml-6 hidden md:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-sm px-3 text-base text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <LanguageSwitch />
          {nav && nav.length > 0 && <HeaderMenu nav={nav} className="md:hidden" />}
        </div>
      </div>
    </header>
  );
}
