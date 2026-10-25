import { getLocale, getTranslations } from "next-intl/server";
import { Icons, SiteFooter, SiteHeader } from "@/design-system";
import { signOutAction } from "@/lib/server/auth-actions";
import { getSession, homeFor } from "@/lib/server/session";

/** Where the site's "Book an appointment" and "Log in" buttons go. */
export const BOOK_HREF = "/book";
export const LOGIN_HREF = "/login";

/** "Demo – Anna de Vries" → "Anna". */
function firstName(displayName: string) {
  return displayName.replace(/^Demo\s*[–-]\s*/, "").split(/\s+/)[0] || displayName;
}

/**
 * Header + main + footer of every public page (the current site's chrome, plus Log in and Book).
 * When someone is signed in, "Log in" becomes their first name, linking to their own area
 * (/admin, /therapist or /account), with a "Log out" button next to it.
 * Reading the session cookie means these pages render per request.
 */
export async function SiteShell({ children }: { children: React.ReactNode }) {
  const [t, locale, session] = await Promise.all([getTranslations("site"), getLocale(), getSession()]);
  const account = session ? { label: firstName(session.displayName), href: homeFor(session.role), hint: t("myAccount") } : undefined;
  const signOut = session ? (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        title={t("signOut")}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-2 text-base font-light text-fg transition-colors duration-150 hover:text-fg-muted hover:underline hover:underline-offset-4 [&_svg]:size-5"
      >
        <Icons.LogOut aria-hidden="true" />
        <span className="xl:sr-only">{t("signOut")}</span>
      </button>
    </form>
  ) : undefined;
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 bg-surface px-4 py-3 text-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-sm"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader bookHref={BOOK_HREF} loginHref={LOGIN_HREF} account={account} accountActions={signOut} />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
