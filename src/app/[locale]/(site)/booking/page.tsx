import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, DisplayHeading, SiteSection } from "@/design-system";
import { getPage } from "@/content";
import { Link } from "@/i18n/navigation";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { serviceBookHref } from "../_lib/booking";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("booking", locale);
  return pageMetadata({ locale, path: "/booking", title: c.meta.title, description: c.meta.description });
}

/** Consultations (the live /booking page). "Book Now" goes to the new online booking. */
export default async function BookingPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("booking", locale);
  const t = await getTranslations("site.booking");
  return (
    <SiteSection aria-labelledby="page-title" width="wide" padded={false} innerClassName="pt-10 pb-16 sm:pt-12 sm:pb-20">
      <div className="mx-auto max-w-[55.25rem] text-center">
        <DisplayHeading as="h1" id="page-title">
          {c.title}
        </DisplayHeading>
        <p className="mt-6 leading-[2]">{c.intro}</p>
      </div>
      {/* The live list: thin rules, 84px round photo, title + tagline + Read More, duration/price, Book Now. Phones: centred cards. */}
      <ul className="mx-auto mt-14 flex max-w-[58.75rem] flex-col gap-4 sm:block sm:border-t sm:border-border-strong/40">
        {c.services.map((s) => (
          <li
            key={s.slug}
            className="flex flex-col items-center gap-3 border border-border-strong/40 px-6 py-8 text-center sm:grid sm:grid-cols-[5.25rem_1fr_8rem_auto] sm:items-start sm:gap-x-8 sm:border-x-0 sm:border-t-0 sm:px-0 sm:text-left"
          >
            <SiteImage image={s.image} sizes="84px" fill className="size-[9.5rem] rounded-full sm:size-[5.25rem]" />
            <div>
              <h2 className="font-heading text-lg font-normal text-fg">
                <Link href={`/service-page/${s.slug}`} className="hover:text-accent hover:underline hover:underline-offset-4">
                  {s.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm">{s.tagline}</p>
              <Link href={`/service-page/${s.slug}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-accent">
                {c.readMore}
                <span className="sr-only">: {s.title}</span>
              </Link>
            </div>
            <p className="w-full border-t border-border-strong/40 pt-3 text-sm sm:w-auto sm:border-0 sm:pt-1">
              <span className="sr-only">{t("duration")}: </span>
              {s.duration}
              <br />
              <span className="sr-only">{t("price")}: </span>
              {s.price}
            </p>
            <div className="w-full sm:w-auto">
              <ButtonLink href={serviceBookHref(s.slug)} className="w-full sm:w-auto sm:min-w-36">
                {c.bookNow}
                <span className="sr-only">: {s.title}</span>
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
    </SiteSection>
  );
}
