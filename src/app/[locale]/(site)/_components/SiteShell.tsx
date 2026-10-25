import { useTranslations } from "next-intl";
import { SiteFooter, SiteHeader } from "@/design-system";

/** Where the site's "Book an appointment" and "Log in" buttons go (placeholders until the booking and auth phases). */
export const BOOK_HREF = "/book";
export const LOGIN_HREF = "/login";

/** Header + main + footer of every public page (the current site's chrome, plus Log in and Book). */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("site");
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 bg-surface px-4 py-3 text-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-sm"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader bookHref={BOOK_HREF} loginHref={LOGIN_HREF} />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
