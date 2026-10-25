import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  BottomNav,
  BrandLink,
  DemoBanner,
  HeaderMenu,
  Icons,
  LanguageSwitch,
  SectionNav,
  ToastProvider,
  type AppNavItem,
} from "@/design-system";
import { signOutAction } from "@/lib/server/auth-actions";

/**
 * Chrome for the admin portal and the therapist dashboard: demo banner, a slim
 * header in the site's style (logo, section menu, name, language), and on
 * phones a menu sheet (admin) or a bottom tab bar (therapist).
 */
export async function DashboardShell({
  area,
  displayName,
  children,
}: {
  area: "admin" | "therapist";
  displayName: string;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const t = await getTranslations(area);
  const tc = await getTranslations(`${area}.shell`);

  const items: AppNavItem[] =
    area === "admin"
      ? [
          { href: "/admin", label: t("nav.overview"), icon: <Icons.Home />, match: "exact" },
          { href: "/admin/grid", label: t("nav.grid"), icon: <Icons.Grid /> },
          { href: "/admin/paper", label: t("nav.paper"), icon: <Icons.CalendarIcon /> },
          { href: "/admin/rooms", label: t("nav.rooms"), icon: <Icons.Door /> },
          { href: "/admin/renters", label: t("nav.renters"), icon: <Icons.Users /> },
          { href: "/admin/rent", label: t("nav.rent"), icon: <Icons.Euro /> },
          { href: "/admin/therapies", label: t("nav.therapies"), icon: <Icons.Leaf /> },
        ]
      : [
          { href: "/therapist", label: t("nav.calendar"), icon: <Icons.CalendarIcon />, match: "exact" },
          { href: "/therapist/blocks", label: t("nav.blocks"), icon: <Icons.Layers /> },
          { href: "/therapist/settings", label: t("nav.settings"), icon: <Icons.Sliders /> },
        ];

  const home = area === "admin" ? "/admin" : "/therapist";

  const accountLinks = (
    <>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-sm px-2 text-base font-light text-fg hover:text-accent hover:underline hover:underline-offset-4 [&_svg]:size-5"
      >
        <Icons.ExternalLink />
        {tc("website")}
      </Link>
      <form action={signOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-base font-light text-fg hover:text-accent hover:underline hover:underline-offset-4 [&_svg]:size-5"
        >
          <Icons.LogOut />
          {tc("signOut")}
        </button>
      </form>
    </>
  );

  return (
    <ToastProvider aboveTabBar={area === "therapist"}>
      <DemoBanner />
      <a
        href="#main"
        className="sr-only z-50 bg-surface px-4 py-3 text-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-sm"
      >
        {tc("skipToContent")}
      </a>
      <header className="border-b border-border bg-header">
        <div className="mx-auto flex min-h-16 max-w-content items-center gap-2 px-gutter py-2">
          <div className="flex min-w-0 shrink items-center gap-3">
            <div className="shrink-0">
              <BrandLink href={home} size="sm" />
            </div>
            <span className="hidden border-l border-border pl-3 font-heading text-base whitespace-nowrap text-fg-muted sm:inline">{tc("portal")}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="hidden max-w-56 truncate px-2 text-sm text-fg-muted lg:inline" title={displayName}>
              <Icons.User className="mr-1.5 inline size-4 align-[-2px]" />
              {displayName}
            </span>
            <div className="hidden whitespace-nowrap lg:flex">{accountLinks}</div>
            <LanguageSwitch />
            <div className="lg:hidden">
              <HeaderMenu
                nav={area === "admin" ? items.map(({ href, label }) => ({ href, label })) : []}
                extra={
                  <>
                    <p className="px-2 pb-1 text-sm text-fg-muted">{tc("signedInAs", { name: displayName })}</p>
                    {accountLinks}
                  </>
                }
              />
            </div>
          </div>
        </div>
        {/* Desktop: the section menu in its own row, like the site's menu row */}
        <div className="mx-auto hidden max-w-content px-gutter pb-1 lg:block">
          <SectionNav items={items} label={tc("menu")} className="-ml-3" />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={area === "therapist" ? "pb-24 outline-none lg:pb-0" : "outline-none"}>
        {children}
      </main>
      {area === "therapist" && <BottomNav items={items} label={tc("menu")} />}
    </ToastProvider>
  );
}
