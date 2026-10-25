import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, siteContact } from "@/design-system";
import { getPage } from "@/content";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { MapBand } from "../_components/MapBand";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("contact", locale);
  return pageMetadata({ locale, path: "/contact", title: c.meta.title, description: c.meta.description });
}

/* The live site's form fields: label above, a single green line under the field. */
const label = "font-heading text-base font-light text-accent";
const line =
  "mt-1 block w-full min-h-11 border-0 border-b border-accent bg-transparent px-0 text-base text-fg outline-offset-4 focus:border-b-2";

/*
 * Contact, as on the live site: the photo band with "Contact" on it,
 * then "Contact us" (form) on the left and the map on the right.
 * Until the platform has its own message inbox (a later phase),
 * sending opens the visitor's email app addressed to the centre.
 */
export default async function ContactPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("contact", locale);
  const t = await getTranslations("site.contactForm");
  const action = `mailto:${siteContact.email}?subject=${encodeURIComponent("Website enquiry")}`;
  return (
    <>
      {/* Photo band, 554px high on desktop, sage veil, large light title (large text: AA at 3:1) */}
      <div className="relative isolate flex min-h-[18rem] items-center justify-center px-gutter sm:min-h-[34.625rem]">
        <SiteImage image={{ ...c.image, alt: "" }} sizes="100vw" fill priority className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-sage/70" />
        <h1 id="page-title" className="font-heading text-[2.75rem] font-light text-on-accent sm:text-[3.5rem]">
          {c.title}
        </h1>
      </div>

      <section aria-labelledby="form-title" className="bg-canvas px-gutter pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div className="mx-auto grid max-w-[47rem] items-start gap-10 lg:grid-cols-[29rem_1fr] lg:gap-6 xl:max-w-[60rem] xl:grid-cols-2">
          <form action={action} method="post" encType="text/plain" className="flex flex-col gap-6" aria-labelledby="form-title">
            <h2 id="form-title" className="font-heading text-[1.75rem] font-light text-accent">
              {c.formTitle}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="cf-first" className={label}>
                  {c.fields.firstName} *
                </label>
                <input id="cf-first" name="first-name" autoComplete="given-name" required className={line} />
              </div>
              <div>
                <label htmlFor="cf-last" className={label}>
                  {c.fields.lastName}
                </label>
                <input id="cf-last" name="last-name" autoComplete="family-name" className={line} />
              </div>
            </div>
            <div>
              <label htmlFor="cf-email" className={label}>
                {c.fields.email} *
              </label>
              <input id="cf-email" name="email" type="email" autoComplete="email" required className={line} />
            </div>
            <div>
              <label htmlFor="cf-message" className={label}>
                {c.fields.message}
              </label>
              <textarea id="cf-message" name="message" rows={3} className={`${line} resize-y`} />
            </div>
            <p className="text-sm text-fg-muted">
              * {t("required")}. {t("note")}
            </p>
            <Button type="submit" className="min-w-28 self-start">
              {c.submit}
            </Button>
          </form>
          <MapBand compact className="lg:mt-0" />
        </div>
      </section>
    </>
  );
}
