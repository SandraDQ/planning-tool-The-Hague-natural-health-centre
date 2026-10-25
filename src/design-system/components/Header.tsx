import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandLink } from "./BrandLink";
import { LanguageSwitch } from "./LanguageSwitch";
import { HeaderMenu, type NavItem } from "./HeaderMenu";
import { cn } from "../utils";

/**
 * Slim header for platform screens that are not part of the public site
 * (e.g. admin tools): logo + name, optional navigation, actions, language switch.
 * Public pages use <SiteHeader>, which reproduces the current website's header.
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
    <header className={cn("border-b border-border bg-header", className)}>
      <div className="mx-auto flex min-h-16 max-w-content items-center gap-3 px-gutter py-2">
        <BrandLink href={homeHref} size="sm" />
        {nav && nav.length > 0 && (
          <nav aria-label={t("design.ui.mainNav")} className="ml-6 hidden md:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-sm px-3 text-base text-fg transition-colors duration-150 hover:text-accent hover:underline hover:underline-offset-4"
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
          {nav && nav.length > 0 && (
            <div className="md:hidden">
              <HeaderMenu nav={nav} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
