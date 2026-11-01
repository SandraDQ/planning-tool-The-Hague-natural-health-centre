import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Button, Icons, siteContact } from "@/design-system";
import { hideWelcome, showWelcome } from "./actions";
import { welcomeCookie, type WelcomeArea } from "./areas";

const STEPS = ["1", "2", "3"] as const;

/**
 * Onboarding message at the top of each signed-in area (D30): a warm welcome, three
 * plain steps and who to call for help. Large text and big buttons for older users.
 * "Got it" hides it on this device; a small "Help" button brings it back.
 */
/** `narrow`: steps stacked, for reading-width pages such as the client area. */
export async function Welcome({ area, name, narrow }: { area: WelcomeArea; name: string; narrow?: boolean }) {
  const [t, locale, jar] = await Promise.all([getTranslations(`welcome.${area}`), getLocale(), cookies()]);
  const tc = await getTranslations("welcome");
  const hidden = jar.get(welcomeCookie(area))?.value === "1";
  const firstName = name.split(" ")[0] ?? name;

  if (hidden) {
    return (
      <form action={showWelcome} className="flex justify-end">
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="ghost" size="sm" leadingIcon={<Icons.Info />}>
          {tc("showAgain")}
        </Button>
      </form>
    );
  }

  return (
    <section aria-labelledby={`welcome-${area}`} className="rounded-md border border-border bg-surface-2 p-5 sm:p-7">
      {/* Not a heading element: it sits above the page's own h1. */}
      <p id={`welcome-${area}`} className="font-heading text-2xl text-fg sm:text-3xl">
        {t("title", { name: firstName })}
      </p>
      <p className="mt-3 max-w-reading text-lg text-fg">{t("intro")}</p>
      <ol className={narrow ? "mt-5 grid gap-4" : "mt-5 grid gap-4 md:grid-cols-3"}>
        {STEPS.map((n) => (
          <li key={n} className="flex gap-3 rounded-md bg-surface p-4">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent"
            >
              {n}
            </span>
            <div>
              <p className="text-lg font-bold text-fg">{t(`step${n}.title`)}</p>
              <p className="mt-1 text-lg text-fg">{t(`step${n}.text`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-lg text-fg">
        {t.rich("help", {
          phone: () => (
            <a href={siteContact.phoneHref} className="font-bold text-accent underline underline-offset-4">
              {siteContact.phone}
            </a>
          ),
          email: () => (
            <a href={`mailto:${siteContact.email}`} className="font-bold text-accent underline underline-offset-4">
              {siteContact.email}
            </a>
          ),
        })}
      </p>
      <form action={hideWelcome} className="mt-5">
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" size="lg" leadingIcon={<Icons.Check />}>
          {tc("gotIt")}
        </Button>
      </form>
    </section>
  );
}
