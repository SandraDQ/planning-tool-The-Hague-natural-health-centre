"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "../utils";

const names: Record<string, string> = { nl: "Nederlands", en: "English" };

/** NL | EN switch (new on the site, styled like its menu). Keeps the visitor on the same page. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("design.ui");
  return (
    <nav aria-label={t("chooseLanguage")} className={cn("flex items-center", className)}>
      <ul className="flex items-center">
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
                aria-label={`${l.toUpperCase()} – ${names[l]}`} // contains the visible "NL"/"EN" (label in name)
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-sm text-sm tracking-[0.12em] underline-offset-[6px] transition-colors duration-150",
                  active ? "font-bold text-accent underline decoration-1" : "text-fg-muted hover:text-fg hover:underline",
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
