import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ButtonLink, Icons, Logo, SiteFooter, SiteHeader, TextField, Button } from "@/design-system";
import { MockNote } from "../_components/MockNote";
import { PhotoPlaceholder } from "../_components/PhotoPlaceholder";

/*
 * Home page mock-up, D19: the CURRENT home page (wix-export/pages/pages/home.md),
 * same sections in the same order and the same text (EN as on the site; NL is a
 * draft translation). Added: "Book an appointment" in the hero and per therapist.
 * Photos are placeholders until the media export is in.
 */

const therapists = ["sandra", "ira", "audrey"] as const;

export default async function HomeMockPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeMock />;
}

/** Section title in the site's condensed display style (uppercase, brand green). */
function DisplayTitle({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`font-display text-2xl font-extralight tracking-[0.04em] text-accent uppercase ${className ?? ""}`}>
      {children}
    </h2>
  );
}

function HomeMock() {
  const t = useTranslations("design.home");
  const tp = useTranslations("design.mock");

  return (
    <>
      <SiteHeader homeHref="/design/home" bookHref="/design/choose-time" />
      <main>
        {/* Hero: photo with a soft grey veil, logo, name and tagline (as on the site) */}
        <section className="relative bg-sand" aria-labelledby="hero-title">
          <p className="absolute right-3 bottom-2 text-sm text-fg-muted">{tp("heroPhoto")}</p>
          <div className="mx-auto flex max-w-content flex-col items-center px-gutter py-14 text-center sm:py-20 lg:py-24">
            <Logo variant="mark" height={88} decorative />
            <h1 id="hero-title" className="mt-5 flex flex-col items-center uppercase">
              <span className="text-lg tracking-[0.35em] text-fg">{t("heroPlace")}</span>
              <span className="mt-2 text-2xl tracking-[0.05em] text-fg">{t("heroName")}</span>
            </h1>
            <p className="mt-5 font-heading text-xl font-light text-fg">
              {t("taglineLead")}
              <br />
              <span className="text-accent">{t("tagline")}</span>
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/design/choose-time" size="lg" leadingIcon={<Icons.CalendarIcon />}>
                {t("book")}
              </ButtonLink>
              <ButtonLink href="/design/home#therapists" variant="secondary" size="lg">
                {t("goTherapists")}
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Nature inspired healthcare */}
        <section className="mx-auto max-w-reading px-gutter py-16 text-center sm:py-20" aria-labelledby="nature">
          <DisplayTitle id="nature">{t("natureTitle")}</DisplayTitle>
          <p className="mt-6 font-heading text-lg font-light text-fg">{t("natureLead")}</p>
          <p className="mt-4 text-base">{t("natureText")}</p>
        </section>

        {/* How can we help? */}
        <section className="bg-surface-2" aria-labelledby="help">
          <div className="mx-auto grid max-w-content items-center gap-10 px-gutter py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 id="help" className="text-xl text-fg">
                {t("helpTitle")}
              </h2>
              <p className="mt-4 text-base">{t("helpText1")}</p>
              <p className="mt-4 text-base">{t("helpText2")}</p>
              <ButtonLink href="/design/home#therapies" className="mt-8">
                {t("seeTherapies")}
              </ButtonLink>
            </div>
            <PhotoPlaceholder className="aspect-[4/3] w-full" />
          </div>
        </section>

        {/* Quote on the site's sage band (large text only: white on sage is 3.3:1) */}
        <section className="bg-sage" aria-label={t("quoteLabel")}>
          <figure className="mx-auto max-w-reading px-gutter py-16 text-center text-on-sage sm:py-20">
            <blockquote className="font-heading text-xl font-light">“{t("quote")}”</blockquote>
            <figcaption className="mt-5 font-heading text-xl font-light">{t("quoteBy")}</figcaption>
          </figure>
        </section>

        {/* How to engage? + therapists */}
        <section id="therapists" className="mx-auto max-w-content scroll-mt-6 px-gutter py-16 sm:py-20" aria-labelledby="engage">
          <div className="mx-auto max-w-reading text-center">
            <h2 id="engage" className="text-xl">
              {t("engageTitle")}
            </h2>
            <p className="mt-4 text-base">{t("engageText1")}</p>
            <ButtonLink href="/design/home#therapists" variant="secondary" className="mt-6">
              {t("goTherapists")}
            </ButtonLink>
            <p className="mt-8 text-base">{t("engageText2")}</p>
          </div>
          <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {therapists.map((key) => (
              <li key={key} className="flex flex-col items-center text-center">
                <PhotoPlaceholder className="aspect-square w-48 rounded-full" label={t(`people.${key}.name`)} />
                <h3 className="mt-5 text-lg">{t(`people.${key}.name`)}</h3>
                <p className="mt-2 text-base">{t(`people.${key}.text`)}</p>
                <ButtonLink href="/design/choose-time" variant="ghost" className="mt-3" trailingIcon={<Icons.ChevronRight />}>
                  {t("bookWith", { name: t(`people.${key}.first`) })}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>

        {/* Accessible to all */}
        <section id="therapies" className="bg-surface-2" aria-labelledby="accessible">
          <div className="mx-auto grid max-w-content items-center gap-10 px-gutter py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <div>
              <DisplayTitle id="accessible">{t("accessibleTitle")}</DisplayTitle>
              <p className="mt-6 text-base">{t("accessibleText")}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <PhotoPlaceholder className="aspect-[3/4] w-full" />
              <PhotoPlaceholder className="aspect-[3/4] w-full" />
            </div>
          </div>
        </section>

        {/* Never miss an event: mailing list on a brand-green band */}
        <section className="bg-accent text-on-accent" aria-labelledby="events">
          <div className="mx-auto grid max-w-content gap-8 px-gutter py-16 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <h2 id="events" className="font-display text-2xl font-extralight tracking-[0.04em] uppercase">
                {t("eventsTitle")}
              </h2>
              <p className="mt-4 font-heading text-lg font-light">{t("eventsText")}</p>
            </div>
            <form className="flex flex-col gap-4 bg-surface p-5 text-fg sm:p-6" action="#">
              <TextField label={t("emailLabel")} type="email" autoComplete="email" placeholder="name@example.com" />
              <Button type="submit" className="self-start">
                {t("send")}
              </Button>
            </form>
          </div>
        </section>

        {/* Map (Google Maps embed on the current site) */}
        <PhotoPlaceholder label={tp("map")} className="h-64 w-full sm:h-80" />
      </main>
      <MockNote />
      <SiteFooter />
    </>
  );
}
