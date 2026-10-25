import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, ButtonLink, Icons, siteContact } from "@/design-system";
import { getEventPage, getEventPages } from "@/content";
import { routing } from "@/i18n/routing";
import { asLocale, pageMetadata } from "../../_lib/metadata";
import { eventDateRange, shortEventDate } from "../../_lib/dates";
import { SiteImage } from "../../_components/SiteImage";
import { Markdown } from "../../_components/Markdown";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => getEventPages().map((e) => ({ locale, slug: e.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  const e = getEventPage(slug);
  if (!e) return {};
  const title = `${e.detail?.title ?? e.listing?.title} | Hague NHC`;
  return pageMetadata({ locale, path: `/event-details-registration/${slug}`, title, description: e.detail?.summary, image: e.detail?.image ?? e.listing?.image ?? undefined });
}

/** An event's page (same URL as on the Wix site). Text is English only, as on the site. */
export default async function EventPage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  setRequestLocale(locale);
  const e = getEventPage(slug);
  if (!e) notFound();
  const t = await getTranslations("site.events");
  const d = e.detail;
  const title = d?.title ?? e.listing!.title;
  const image = d?.image ?? e.listing?.image;
  const price = d?.priceText.match(/Price \| ([^|]+)/)?.[1]?.trim();

  const when = d ? eventDateRange(d.start, d.end, locale) : shortEventDate(e.listing!.dateShort, locale);
  const cancelled = d?.status === "EventCancelled";

  return (
    <div className="bg-canvas px-gutter pt-6 pb-16 sm:pb-20">
      <div className="mx-auto max-w-site">
        <ButtonLink href="/events" variant="ghost" size="sm" leadingIcon={<Icons.ChevronLeft />} className="-ml-3">
          {t("backToEvents")}
        </ButtonLink>
      </div>

      {/* The live hero card: photo left, linen box right with date, title, summary and the ticket button */}
      <div className="mx-auto mt-3 grid max-w-site md:grid-cols-2">
        {image && <SiteImage image={{ src: image, alt: "" }} sizes="(min-width: 980px) 490px, (min-width: 768px) 50vw, 100vw" fill priority className="aspect-[4/3] w-full md:aspect-auto md:min-h-[33rem]" />}
        <div className="flex flex-col items-start justify-center bg-linen px-6 py-10 sm:px-10" lang="en">
          {cancelled && <Badge tone="danger" className="mb-3">{t("cancelled")}</Badge>}
          <p className="text-sm text-fg-muted">
            {when}
            {d?.location && <span> | {siteContact.name}</span>}
          </p>
          <h1 id="event-title" className="mt-2 font-heading text-[1.75rem] leading-tight font-light text-fg sm:text-[2.125rem]">
            {title}
          </h1>
          {d?.summary && <p className="mt-5 text-base">{d.summary}</p>}
          {!cancelled && (
            <ButtonLink href="#tickets" className="mt-8 min-w-36">
              {t("reserve")}
            </ButtonLink>
          )}
        </div>
      </div>

      <section aria-labelledby="time-location" className="mx-auto mt-14 max-w-[47rem] border-b border-border-strong/40 pb-10 text-center">
        <h2 id="time-location" className="font-heading text-[1.625rem] font-light text-fg">
          {t("timeLocation")}
        </h2>
        <p className="mt-4 text-sm">{when}</p>
        {d?.location && <p className="text-sm">{d.location}</p>}
        {!d && e.listing?.multipleDates && <p className="mt-2 text-sm text-fg-muted">{t("multipleDates")}</p>}
      </section>

      <section aria-labelledby="about-event" className="mx-auto mt-10 max-w-[47rem]">
        <h2 id="about-event" className="text-center font-heading text-[1.625rem] font-light text-fg">
          {t("aboutEvent")}
        </h2>
        {locale !== "en" && <p className="mt-4 text-center text-sm text-fg-muted">{t("englishOnly")}</p>}
        <div lang="en" className="mt-6">
          {d ? <Markdown source={d.description} /> : <p>{t("detailsSoon")}</p>}
        </div>
      </section>

      {!cancelled && (
        <section id="tickets" aria-labelledby="tickets-title" className="mx-auto mt-14 max-w-[47rem] scroll-mt-24">
          <h2 id="tickets-title" className="text-center font-heading text-[1.625rem] font-light text-fg">
            {t("tickets")}
          </h2>
          <div className="mt-5 flex flex-col items-start gap-4 border border-border-strong/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              {price && <p className="text-lg">{price}</p>}
              {d?.registrationText && (
                <p className="text-sm text-fg-muted" lang="en">
                  {d.registrationText}
                </p>
              )}
            </div>
            <ButtonLink href="/contact" className="min-w-36">
              {t("reserve")}
            </ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}
