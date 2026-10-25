import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getPage } from "@/content";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { ImageBanner, PageTitle } from "../_components/PageIntro";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/kopie-van-conditions";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("conditions", locale);
  return pageMetadata({ locale, path: PATH, title: c.meta.title, description: c.meta.description });
}

/** Conditions (menu item "Conditions"; the live URL is /kopie-van-conditions). */
export default async function ConditionsPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("conditions", locale);
  return (
    <>
      <PageTitle>{c.title}</PageTitle>

      <section className="bg-canvas pb-6" aria-label={c.lead}>
        <ImageBanner image={c.image}>{c.lead}</ImageBanner>
        <div className="mx-auto mt-8 flex max-w-[61.25rem] flex-col gap-5 px-gutter text-center text-lg font-light text-fg-muted">
          {c.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      {/* The conditions: stone cards with a round photo, three per row */}
      <section className="bg-canvas px-gutter pt-6 pb-14" aria-label={c.title}>
        <ul className="mx-auto grid max-w-[56.5rem] grid-cols-1 gap-x-4 gap-y-4 min-[480px]:grid-cols-2 md:grid-cols-3 md:gap-x-12">
          {c.items.map((it) => (
            <li key={it.title} className="flex flex-col items-center bg-stone px-4 pt-3 pb-8 text-center">
              <SiteImage image={it.image} sizes="173px" fill className="aspect-square w-[10.8rem] rounded-full" />
              <h2 className="mt-4 font-heading text-lg leading-snug font-normal">{it.title}</h2>
              <p className="mt-3 font-heading text-sm leading-relaxed font-light">{it.examples}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
