import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, ButtonLink } from "@/design-system";
import { getEventListing, getPage } from "@/content";
import { Link } from "@/i18n/navigation";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { shortEventDate } from "../_lib/dates";
import { SiteImage } from "../_components/SiteImage";
import { PageTitle } from "../_components/PageIntro";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/events";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("events", locale);
  return pageMetadata({ locale, path: PATH, title: c.meta.title, description: c.meta.description });
}

/** Events, talks and workshops: the list as on the current site (from the Wix export). */
export default async function EventsPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("events", locale);
  const t = await getTranslations("site.events");
  const events = getEventListing();

  return (
    <>
      <PageTitle>{c.title}</PageTitle>
      <section className="bg-canvas px-gutter pt-3 pb-20" aria-labelledby="page-title">
        <div className="mx-auto max-w-[61.25rem] text-center font-heading font-light">
          <p className="text-lg">
            <Link href={c.signup.href} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              {c.signup.text}
            </Link>
          </p>
          <p className="mt-4 text-base text-fg-muted">{c.note}</p>
        </div>

        <ul className="mx-auto mt-8 grid max-w-[79.5rem] gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {events.map((e) => {
            const href = `/event-details-registration/${e.slug}`;
            return (
              <li key={e.slug} className="flex flex-col bg-linen text-center">
                {e.image && (
                  <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
                    <SiteImage image={{ src: e.image, alt: "" }} sizes="(min-width: 1024px) 407px, (min-width: 640px) 50vw, 100vw" fill className="aspect-[407/229] w-full" />
                  </Link>
                )}
                <div className="flex flex-1 flex-col items-center px-5 pt-5 pb-6">
                  {e.multipleDates && <Badge className="border border-border-strong/40 bg-surface font-normal">{t("multipleDates")}</Badge>}
                  <h2 className="mt-3 font-heading text-lg leading-snug font-light sm:text-[1.375rem]" lang="en">
                    <Link href={href} className="hover:underline hover:underline-offset-4">
                      {e.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">{shortEventDate(e.dateShort, locale)}</p>
                  <Link href={href} className="inline-flex min-h-11 items-center text-sm text-fg underline underline-offset-4 hover:text-accent-strong">
                    {t("moreInfo")}
                  </Link>
                  <ButtonLink href={href} size="sm" className="mt-auto min-w-36 font-light">
                    {t("reserve")}
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
