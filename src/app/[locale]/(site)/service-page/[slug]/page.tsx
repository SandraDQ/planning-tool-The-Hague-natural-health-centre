import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, Icons, SiteSection, siteContact } from "@/design-system";
import { getPage } from "@/content";
import { routing } from "@/i18n/routing";
import { asLocale, pageMetadata } from "../../_lib/metadata";
import { serviceBookHref } from "../../_lib/booking";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => getPage("booking", locale).services.map((s) => ({ locale, slug: s.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  const s = getPage("booking", locale).services.find((x) => x.slug === slug);
  if (!s) return {};
  return pageMetadata({ locale, path: `/service-page/${slug}`, title: s.metaTitle, description: s.description });
}

/** A bookable service (the live /service-page/... pages). */
export default async function ServicePage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  setRequestLocale(locale);
  const c = getPage("booking", locale);
  const s = c.services.find((x) => x.slug === slug);
  if (!s) notFound();
  const t = await getTranslations("site.booking");
  return (
    <SiteSection aria-labelledby="service-title" padded={false} innerClassName="pt-10 pb-16 sm:pt-16 sm:pb-20">
      {/* The live service page: one left-aligned column, 720px */}
      <div className="mx-auto max-w-[45rem]">
        <ButtonLink href="/booking" variant="ghost" size="sm" leadingIcon={<Icons.ChevronLeft />} className="-ml-3">
          {c.title.charAt(0) + c.title.slice(1).toLowerCase()}
        </ButtonLink>
        <h1 id="service-title" className="mt-4 font-heading text-[2rem] font-normal text-fg sm:text-[2.5rem]">
          {s.title}
        </h1>
        <p className="mt-3 text-sm">{s.tagline}</p>
        <dl className="mt-6 inline-flex flex-wrap border border-border-strong/40 text-sm">
          <div className="border-r border-border-strong/40 px-3 py-3">
            <dt className="sr-only">{t("duration")}</dt>
            <dd>{s.duration}</dd>
          </div>
          <div className="border-r border-border-strong/40 px-3 py-3">
            <dt className="sr-only">{t("price")}</dt>
            <dd>{s.price}</dd>
          </div>
          <div className="px-3 py-3">
            <dt className="sr-only">{c.contactDetails}</dt>
            <dd>{siteContact.name}</dd>
          </div>
        </dl>
        <div className="mt-6 border-b border-border-strong/40 pb-6">
          <ButtonLink href={serviceBookHref(s.slug)}>
            {c.bookNow}
          </ButtonLink>
        </div>
        <section aria-labelledby="desc" className="border-b border-border-strong/40 py-6">
          <h2 id="desc" className="font-heading text-lg font-normal text-fg">
            {c.serviceDescription}
          </h2>
          <p className="mt-3 text-sm">{s.description}</p>
        </section>
        <section aria-labelledby="contact-details" className="border-b border-border-strong/40 py-6">
          <h2 id="contact-details" className="font-heading text-lg font-normal text-fg">
            {c.contactDetails}
          </h2>
          <p className="mt-3 text-sm">{c.location}</p>
        </section>
      </div>
    </SiteSection>
  );
}
