import { useTranslations } from "next-intl";
import { DisplayHeading, buttonClasses, siteContact } from "@/design-system";

/*
 * "NEVER MISS AN EVENT" box with the mailing-list form, as on the live site:
 * a wide green box, centred white title and text, one email field and a white pill "Send".
 * The live box has a stock photo under the green (not in the media backup), so it is plain green here.
 * The site used a Wix form (with reCAPTCHA); until the platform has its own mailing list,
 * sending opens the visitor's email app with a sign-up message.
 */
export function NewsletterBand({ title, text }: { title: string; text: string }) {
  const t = useTranslations("site.newsletter");
  const action = `mailto:${siteContact.email}?subject=${encodeURIComponent("Events newsletter sign-up")}`;
  return (
    <section id="newsletter" aria-labelledby="newsletter-title" className="scroll-mt-4 bg-canvas py-10 sm:py-12">
      <div className="mx-auto max-w-[82.5rem] sm:px-gutter">
        <div className="bg-accent px-gutter py-12 text-center text-on-accent sm:py-16">
          <DisplayHeading id="newsletter-title" tone="inherit">
            {title}
          </DisplayHeading>
          <p className="mx-auto mt-4 max-w-[38rem] text-lead font-light">{text}</p>
          <form action={action} method="post" encType="text/plain" className="mx-auto mt-8 flex max-w-[30rem] flex-col items-center gap-6">
            <label htmlFor="newsletter-email" className="sr-only">
              {t("emailLabel")}
            </label>
            <input
              id="newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("placeholder")}
              className="min-h-12 w-full bg-surface px-4 text-base text-fg placeholder:text-fg-muted"
            />
            <button
              type="submit"
              className={buttonClasses({ variant: "secondary", className: "min-w-40 border-surface font-light" })}
            >
              {t("send")}
            </button>
            <p className="text-sm font-light">{t("note")}</p>
          </form>
        </div>
      </div>
    </section>
  );
}
