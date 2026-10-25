import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ButtonLink, DisplayHeading, Icons, Logo } from "@/design-system";
import { getPage } from "@/content";
import { asLocale, pageMetadata } from "./_lib/metadata";
import { SiteImage } from "./_components/SiteImage";
import { NewsletterBand } from "./_components/NewsletterBand";
import { MapBand } from "./_components/MapBand";
import { WhatsAppIconButton } from "./_components/ContactButtons";
import { BOOK_HREF } from "./_components/SiteShell";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("home", locale);
  return pageMetadata({ locale, path: "/", title: c.meta.title, description: c.meta.description });
}

/**
 * Home: the live site's home page (wix-export/layout/home), same sections in the same order.
 * Left out: the Google Reviews widget (third-party, reviewer data not exported) and the
 * POWR mailing-list popup in the hero. Added (D19): the "Book an appointment" button in the hero.
 */
export default async function HomePage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("home", locale);

  return (
    <>
      {/* 1. Hero: the flower-field photo under a light grey veil, hummingbird + name + tagline */}
      <section
        className="relative isolate flex min-h-[40rem] flex-col items-center overflow-hidden px-gutter pt-12 pb-20 text-center text-surface-2 sm:pt-16 lg:min-h-[min(101vw,91rem)]"
        aria-labelledby="hero-title"
      >
        <SiteImage image={c.hero.image} sizes="100vw" fill priority className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-fg/25" />
        <h1 id="hero-title" className="flex flex-col items-center font-normal">
          <span className="flex items-center gap-3">
            <Logo variant="mark" height={88} decorative />
            <span className="font-display text-[1.25rem] font-extralight tracking-[0.35em] uppercase sm:text-[1.5625rem]">{c.hero.place}</span>
          </span>
          <span className="mt-16 font-display text-[2.125rem] leading-tight font-extralight uppercase sm:mt-24 sm:text-[3.4375rem]">
            {c.hero.name}
          </span>
        </h1>
        <p className="mt-4 font-heading text-[1.375rem] leading-relaxed font-light sm:text-[1.625rem]">
          {c.hero.taglineLead}
          <br />
          <span className="tracking-[0.06em] [word-spacing:0.6em]">{c.hero.tagline}</span>
        </p>
        <ButtonLink href={BOOK_HREF} size="lg" leadingIcon={<Icons.CalendarIcon />} className="mt-8">
          {c.hero.book}
        </ButtonLink>
      </section>

      {/* 2. Nature inspired healthcare: sand band, centred */}
      <section className="bg-sand px-gutter py-12 text-center sm:py-14" aria-labelledby="nature">
        <div className="mx-auto max-w-[61.25rem]">
          <DisplayHeading id="nature">{c.nature.title}</DisplayHeading>
          <p className="mx-auto mt-6 max-w-[61.25rem] text-lead font-light text-fg-muted">
            {c.nature.lead}
            <br />
            {c.nature.text}
          </p>
        </div>
      </section>

      {/* 3. How can we help? text left (centred), square photo right */}
      <section className="bg-canvas px-gutter py-10 sm:py-14" aria-labelledby="help">
        <div className="mx-auto grid max-w-[75rem] items-center gap-10 lg:grid-cols-2 lg:gap-24">
          <div className="order-2 text-center lg:order-1">
            <DisplayHeading id="help" caps={false}>
              {c.help.title}
            </DisplayHeading>
            {c.help.paragraphs.map((p) => (
              <p key={p} className="mt-4 text-lead font-light text-fg-muted">
                {p}
              </p>
            ))}
            <ButtonLink href={c.help.cta.href} className="mt-8 min-w-48 font-light">
              {c.help.cta.label}
            </ButtonLink>
          </div>
          <SiteImage
            image={c.help.image}
            sizes="(min-width: 1024px) 491px, 100vw"
            fill
            className="order-1 aspect-square w-full max-w-[30.7rem] justify-self-center lg:order-2"
          />
        </div>
      </section>

      {/* 4. Quote in a wide sage-green box (large text only on it) */}
      <section className="bg-canvas pb-10 sm:px-gutter sm:pb-14" aria-label={c.quote.label}>
        <figure className="mx-auto max-w-[82.5rem] bg-accent/80 px-gutter py-16 text-center text-on-accent sm:py-24">
          <blockquote className="mx-auto max-w-[55rem] font-heading text-[1.625rem] leading-snug font-light sm:text-[2.75rem]">
            {c.quote.text}
          </blockquote>
          <figcaption className="mt-6 font-heading text-[1.375rem] font-light sm:text-[1.625rem]">{c.quote.by}</figcaption>
        </figure>
      </section>

      {/* 5. How to engage? stone band with the three contact therapists */}
      <section className="bg-stone px-gutter pt-14 pb-20 text-center sm:pt-16 sm:pb-28" aria-labelledby="engage">
        <div className="mx-auto max-w-[57rem]">
          <h2 id="engage" className="font-heading text-[2.25rem] font-normal sm:text-[3.5rem]">
            {c.engage.title}
          </h2>
          <p className="mt-4 text-lg font-light">{c.engage.text1}</p>
          <ButtonLink href={c.engage.cta.href} className="mt-5 min-w-56 font-light">
            {c.engage.cta.label}
          </ButtonLink>
          <p className="mt-5 text-lg font-light">{c.engage.text2}</p>
        </div>
        <ul className="mx-auto mt-12 grid max-w-[77.5rem] gap-14 md:grid-cols-3 md:gap-10">
          {c.engage.people.map((p) => (
            <li key={p.name} className="flex flex-col items-center">
              <SiteImage image={p.image} sizes="139px" fill className="aspect-square w-[8.7rem] rounded-full" position="50% 30%" />
              <h3 className="mt-5 font-heading text-lg font-normal">{p.name}</h3>
              <p className="mt-3 max-w-[18rem] text-lg leading-relaxed font-light">{p.text}</p>
              <WhatsAppIconButton href={p.whatsapp.href} label={p.whatsapp.label} className="mt-5" />
            </li>
          ))}
        </ul>
      </section>

      {/* 6. Accessible to all: text left (centred), square photo right */}
      <section className="bg-canvas px-gutter py-10 sm:py-12" aria-labelledby="accessible">
        <div className="mx-auto grid max-w-[75rem] items-center gap-10 lg:grid-cols-2 lg:gap-24">
          <div className="text-center">
            <DisplayHeading id="accessible">{c.accessible.title}</DisplayHeading>
            <p className="mt-6 text-lead font-light text-fg-muted">{c.accessible.text}</p>
          </div>
          <SiteImage
            image={c.accessible.image}
            sizes="(min-width: 1024px) 491px, 100vw"
            fill
            className="aspect-square w-full max-w-[30.7rem] justify-self-center"
          />
        </div>
      </section>

      <NewsletterBand title={c.newsletter.title} text={c.newsletter.text} />
      <MapBand />
    </>
  );
}
