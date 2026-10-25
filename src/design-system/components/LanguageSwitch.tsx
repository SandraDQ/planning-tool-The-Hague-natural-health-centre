"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "../utils";

const names: Record<string, string> = { nl: "Nederlands", en: "English" };

/** NL | EN switch. Keeps the visitor on the same page. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("design.ui");
  return (
    <nav aria-label={t("chooseLanguage")} className={cn("flex items-center", className)}>
      <ul className="flex items-center gap-0.5">
        {routing.locales.map((l) => {
          const active = l === locale;
          return (
            <li key={l}>
              <Link
                href={pathname}
                locale={l}
                hrefLang={l}
                lang={l}
                aria-current={active ? "true" : undefined}
                aria-label={names[l]}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-sm text-sm font-semibold tracking-wide transition-colors duration-150",
                  active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {l.toUpperCase()}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
