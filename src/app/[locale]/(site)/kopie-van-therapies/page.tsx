import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/design-system";
import { getPage } from "@/content";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { Markdown } from "../_components/Markdown";
import { ImageBanner, PageTitle } from "../_components/PageIntro";
import { therapyBookHref } from "../_lib/booking";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/kopie-van-therapies";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("therapies", locale);
  return pageMetadata({ locale, path: PATH, title: c.meta.title, description: c.meta.description });
}

/** Therapies (menu item "Therapies"; the live URL is /kopie-van-therapies). */
export default async function TherapiesPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("therapies", locale);
  const en = getPage("therapies", "en");
  const tb = await getTranslations("site.booking");
  return (
    <>
      <PageTitle>{c.title}</PageTitle>

      {/* Banner sentence on the green photo, then the intro and "Your health. Done your way." */}
      <section className="bg-canvas pb-6" aria-labelledby="your-way">
        <ImageBanner image={c.image}>{c.intro[0]}</ImageBanner>
        <div className="mx-auto mt-8 flex max-w-[61.25rem] flex-col gap-6 px-gutter text-center font-heading text-lg font-light text-fg-muted">
          {c.intro.slice(1).map((p) => (
            <p key={p}>{p}</p>
          ))}
          <h2 id="your-way" className="mt-2 font-heading text-lg font-normal text-fg">
            {c.yourWay.title}
          </h2>
          <p className="-mt-2">{c.yourWay.text}</p>
          <ButtonLink href={c.yourWay.cta.href} className="min-w-56 self-center font-light">
            {c.yourWay.cta.label}
          </ButtonLink>
        </div>
      </section>

      {/* The therapies: linen cards, three per row */}
      <section className="bg-canvas px-3 py-10 sm:px-gutter" aria-label={c.title}>
        <ul className="mx-auto grid max-w-[79rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.items.map((it, i) => (
            <li key={it.title} className="flex flex-col items-center bg-linen px-5 pt-5 pb-10 text-center sm:px-8">
              <SiteImage image={it.image} sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw" fill className="aspect-[320/190] w-full max-w-80" />
              <h2 className="mt-6 font-sans text-[1.375rem] font-light text-taupe sm:text-[1.5rem]">{it.title}</h2>
              <Markdown source={it.body} className="mt-4 text-lg leading-relaxed font-light text-fg-muted" />
              <ButtonLink href={therapyBookHref(en.items[i]?.title ?? it.title)} size="sm" className="mt-6">
                {tb("book")}
                <span className="sr-only">: {it.title}</span>
              </ButtonLink>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
