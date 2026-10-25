import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, DisplayHeading, cn } from "@/design-system";
import { getPage } from "@/content";
import { Link } from "@/i18n/navigation";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { Markdown, SmartLink } from "../_components/Markdown";
import { Gallery } from "../_components/Gallery";
import { ContactButtons } from "../_components/ContactButtons";
import { NewsletterBand } from "../_components/NewsletterBand";
import { MapBand } from "../_components/MapBand";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/about-us";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("about", locale);
  return pageMetadata({ locale, path: PATH, title: c.meta.title, description: c.meta.description });
}

/** About us (wix-export/layout/about-us): who we are, Sandra's story, photos, the team, each therapist's profile, sustainable living. */
export default async function AboutPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("about", locale);
  const t = await getTranslations("site.about");
  const [storyStart, storyRest] = splitStory(c.story.body);

  return (
    <>
      {/* 1. Who are we? stone band: dune photo top left, white card overlapping it on the right */}
      <section className="bg-stone px-gutter py-10 sm:py-16" aria-labelledby="page-title">
        <div className="mx-auto max-w-[80rem]">
          <SiteImage
            image={c.hero.image}
            sizes="(min-width: 1024px) 963px, 100vw"
            fill
            priority
            className="aspect-[963/373] w-full lg:w-[75%]"
          />
          <div className="relative bg-surface px-6 py-10 sm:px-12 lg:-mt-20 lg:ml-[25%] lg:w-[75%] lg:px-[11%] lg:py-14">
            <h1 id="page-title" className="font-heading text-[2.25rem] font-normal sm:text-[3.5rem]">
              {c.hero.title}
            </h1>
            <div className="mt-4 flex flex-col gap-5 font-heading text-lead font-light">
              {c.hero.intro.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {c.hero.buttons.map((b) => (
                <ButtonLink key={b.href} href={b.href} size="sm" className="font-heading text-sm font-light tracking-[0.1em]">
                  {b.label}
                </ButtonLink>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Sandra's story */}
      <section id="story" className="scroll-mt-4 bg-canvas px-gutter pt-16 pb-12" aria-labelledby="story-title">
        <div className="mx-auto max-w-[57rem]">
          <h2 id="story-title" className="text-center font-heading text-[1.875rem] leading-tight font-normal sm:text-[2.8125rem]">
            {c.story.title[0]}
            <br />
            {c.story.title[1]}
          </h2>
          <p className="mt-8 font-heading text-lg font-light">{c.story.subtitle}</p>
          <Markdown source={storyStart} className="mt-4 font-heading font-light" />
          <details className="group mt-4 font-heading font-light">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-normal underline-offset-4 hover:underline group-open:hidden">
              {c.story.readMore}
            </summary>
            <Markdown source={storyRest} />
          </details>
        </div>
      </section>

      {/* 3. Photo slider (round photos on sand) */}
      <section className="bg-sand py-9" aria-label={t("gallery")}>
        <Gallery images={c.gallery} label={t("gallery")} prevLabel={t("galleryPrev")} nextLabel={t("galleryNext")} />
      </section>

      {/* 4. Meet our therapists */}
      <section id="therapists" className="scroll-mt-4 bg-canvas px-gutter pt-12 pb-16" aria-labelledby="team-title">
        <div className="mx-auto max-w-[61.25rem] text-center">
          <h2 id="team-title" className="font-heading text-[1.75rem] font-normal sm:text-[2.5rem]">
            {c.team.label}
          </h2>
          {c.team.intro.map((p) => (
            <p key={p} className="mt-5 font-heading text-lead font-light text-fg-muted">
              {p}
            </p>
          ))}
        </div>
        <ul className="mx-auto mt-12 grid max-w-[77rem] grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
          {c.team.members.map((m, i) => (
            <li key={`${m.name}-${i}`} className="flex flex-col items-center text-center">
              <SiteImage
                image={m.image}
                sizes="192px"
                fill
                className="aspect-square w-32 rounded-full border-4 border-surface bg-surface shadow-md sm:w-48"
              />
              <h3 className="mt-4 font-sans text-lg font-light text-fg-muted sm:text-[1.375rem]">
                {m.anchor ? (
                  <Link href={`${PATH}#${m.anchor}`} className="underline decoration-1 underline-offset-4 hover:text-fg">
                    {m.name}
                  </Link>
                ) : (
                  m.name
                )}
              </h3>
              <p className="mt-1 max-w-[14rem] text-base leading-relaxed whitespace-pre-line text-fg-muted">{m.role}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Therapist profiles: alternating linen and white boxes */}
      <div className="bg-canvas pb-12 sm:px-gutter">
        <div className="mx-auto flex max-w-[82.5rem] flex-col gap-4">
          {c.profiles.map((p, i) => (
            <article
              key={p.id}
              id={p.id}
              className={cn("scroll-mt-4", i % 2 === 0 ? "bg-linen" : "bg-canvas")}
              aria-labelledby={`${p.id}-name`}
            >
              <div className="grid gap-8 px-gutter py-12 md:grid-cols-[minmax(13rem,24%)_1fr] md:gap-12 md:px-12 lg:px-20">
                <div className="flex flex-col items-center gap-3 text-center text-fg-muted">
                  <SiteImage image={p.image} sizes="205px" fill className="aspect-square w-44 rounded-full md:w-[205px]" />
                  <h2 id={`${p.id}-name`} className="mt-2 font-sans text-[1.375rem] font-light">
                    {p.name}
                  </h2>
                  <p className="text-base whitespace-pre-line">{p.roles.join("\n")}</p>
                  <ContactButtons links={p.contacts} />
                  <p className="text-sm whitespace-pre-line">
                    {p.languages.href ? <SmartLink href={p.languages.href}>{p.languages.text}</SmartLink> : p.languages.text}
                  </p>
                </div>
                <Markdown source={p.body} size="lead" className="font-light text-fg-muted" />
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* 6. Sustainable living */}
      <section className="bg-canvas px-gutter pt-10 pb-20" aria-labelledby="sustainable">
        <div className="mx-auto max-w-[71rem]">
          <DisplayHeading id="sustainable" caps={false} className="text-center">
            {c.sustainable.title}
          </DisplayHeading>
          <ul className="mt-10 grid gap-12 md:grid-cols-3 md:gap-10">
            {c.sustainable.items.map((it) => (
              <li key={it.title} className="text-center">
                <SiteImage image={it.image} sizes="(min-width: 768px) 329px, 100vw" fill className="aspect-[329/260] w-full" />
                <h3 className="mt-5 font-sans text-[1.5rem] font-light text-brown">{it.title}</h3>
                <p className="mt-3 text-lg leading-relaxed font-light text-fg-muted">{it.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <NewsletterBand title={c.newsletter.title} text={c.newsletter.text} />
      <MapBand />
    </>
  );
}

/** Show the first two paragraphs of the story; the rest opens with "Read more" (as on the site). */
function splitStory(body: string): [string, string] {
  const parts = body.split("\n\n");
  return [parts.slice(0, 2).join("\n\n"), parts.slice(2).join("\n\n")];
}
