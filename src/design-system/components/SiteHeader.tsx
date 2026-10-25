import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandLink } from "./BrandLink";
import { ButtonLink } from "./Button";
import { HeaderMenu, type NavItem } from "./HeaderMenu";
import { LanguageSwitch } from "./LanguageSwitch";
import { SiteNavLinks } from "./SiteNavLinks";
import { CalendarIcon, User } from "./icons";
import { siteActions, siteNav } from "../site";
import { cn } from "../utils";

/**
 * The public website's header, as on the current site: hummingbird logo with
 * "NATURAL HEALTH CENTRE / THE HAGUE" and the main menu (Home … Contact).
 * Added (D19): a "Log in" link, a "Book an appointment" button and the NL/EN switch.
 *
 * - Phones/tablets/small laptops (< 1280px): logo + "Book" button + menu sheet (menu, log in, language).
 * - Desktop (xl+): one 120px row like the live site: logo left, menu, then language, log in and book.
 *
 * Pass `account` when someone is signed in: the "Log in" link becomes a link to their dashboard.
 * Pass `nav` / `bookHref` only to override the site's own menu (e.g. in mock-ups).
 */
export function SiteHeader({
  nav,
  bookHref = siteActions.book,
  loginHref = siteActions.login,
  homeHref = "/",
  account,
  className,
}: {
  nav?: NavItem[];
  bookHref?: string;
  loginHref?: string;
  homeHref?: string;
  account?: { label: string; href: string };
  className?: string;
}) {
  const t = useTranslations("design.site");
  const tu = useTranslations("design.ui");
  const items: NavItem[] = nav ?? siteNav.map((n) => ({ href: n.href, label: t(`nav.${n.key}`) }));
  const accountLink = account ?? { label: t("login"), href: loginHref };

  return (
    <header className={cn("bg-header", className)}>
      <div className="mx-auto max-w-[75rem] px-gutter">
        <div className="flex items-center gap-1.5 py-2.5 sm:gap-4 xl:min-h-30 xl:gap-3 xl:py-3">
          <div className="min-w-0 sm:hidden">
            <BrandLink href={homeHref} size="sm" />
          </div>
          <div className="hidden sm:block xl:hidden">
            <BrandLink href={homeHref} size="md" />
          </div>
          <div className="hidden xl:block">
            <BrandLink href={homeHref} size="lg" />
          </div>

          {/* Desktop: the site's menu in one row on the right, as on the live site */}
          <SiteNavLinks nav={items} label={tu("mainNav")} className="ml-auto hidden xl:block" />

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 xl:ml-2">
            <div className="hidden xl:block">
              <LanguageSwitch />
            </div>
            <div className="hidden sm:block">
              <Link
                href={accountLink.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-sm px-2 text-base font-light whitespace-nowrap text-fg transition-colors duration-150 hover:text-fg-muted hover:underline hover:underline-offset-4"
              >
                <User className="size-5" />
                {accountLink.label}
              </Link>
            </div>
            <div className="sm:hidden">
              <ButtonLink href={bookHref} size="sm">
                {t("bookShort")}
              </ButtonLink>
            </div>
            {/* Full label on tablets and wide screens; next to the desktop menu (1280–1535px) the short one, so the row fits */}
            <div className="hidden sm:block xl:hidden 2xl:block">
              <ButtonLink href={bookHref} leadingIcon={<CalendarIcon />} className="whitespace-nowrap">
                {t("book")}
              </ButtonLink>
            </div>
            <div className="hidden xl:block 2xl:hidden">
              <ButtonLink href={bookHref} leadingIcon={<CalendarIcon />} className="whitespace-nowrap" aria-label={t("book")}>
                {t("bookShort")}
              </ButtonLink>
            </div>
            <div className="-mr-2 xl:hidden">
              <HeaderMenu
                nav={items}
                extra={
                  <>
                    <Link
                      href={accountLink.href}
                      className="inline-flex min-h-12 items-center gap-2 rounded-sm px-2 text-lg text-fg hover:bg-surface-2"
                    >
                      <User className="size-5" />
                      {accountLink.label}
                    </Link>
                    <div className="flex items-center justify-between gap-3 px-2">
                      <span className="text-base text-fg-muted">{tu("chooseLanguage")}</span>
                      <LanguageSwitch />
                    </div>
                  </>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
