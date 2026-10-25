import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClasses, cn } from "@/design-system";
import { getPage } from "@/content";
import { Link } from "@/i18n/navigation";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { SiteImage } from "../_components/SiteImage";
import { Markdown } from "../_components/Markdown";
import { Gallery } from "../_components/Gallery";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("pricing", locale);
  return pageMetadata({ locale, path: "/services-1", title: c.meta.title, description: c.meta.description });
}

/** Pricing & Packages (live URL /services-1, not in the menu). */
export default async function PricingPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("pricing", locale);
  const t = await getTranslations("site.about");
  const cols = c.table.columns;
  const keys = ["initialDuration", "initialRate", "followDuration", "followRate", "insurance"] as const;

  return (
    <>
      {/* Linen intro box, 980px, centred text */}
      <div className="bg-canvas px-gutter pt-8 sm:pt-14">
        <section aria-labelledby="page-title" className="mx-auto max-w-site bg-linen px-5 py-10 text-center sm:px-14 sm:py-14">
          <h1 id="page-title" className="font-heading text-[1.875rem] font-normal text-fg sm:text-[2.5rem]">
            {c.title}
          </h1>
          <p className="mt-2 font-heading text-lg">{c.subtitle}</p>
          <div className="mx-auto mt-8 flex max-w-[47rem] flex-col gap-5 font-heading text-base">
            {c.intro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      </div>

      <section aria-label={cols.therapy} className="bg-canvas px-gutter py-14 sm:py-20">
        {/* Desktop: the site's table (dark header row). Phones: one card per therapy. */}
        <div className="mx-auto hidden max-w-[43rem] overflow-x-auto md:block">
          <table className="w-full border-collapse text-center font-heading text-sm">
            <thead>
              <tr className="bg-fg-muted text-surface">
                <th scope="col" className="p-2.5 font-normal">{cols.therapy}</th>
                <th scope="col" className="p-2.5 font-normal">{cols.therapist}</th>
                {keys.map((k) => (
                  <th key={k} scope="col" className="p-2.5 font-normal">
                    {cols[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.table.rows.map((r) => (
                <tr key={r.therapy} className="border border-border-strong/40">
                  <th scope="row" className="border-x border-border-strong/40 p-3 font-normal">{r.therapy}</th>
                  <td className="border-x border-border-strong/40 p-3">
                    <Link href={`/about-us#${r.anchor}`} className="text-fg-muted underline-offset-4 hover:text-accent hover:underline">
                      {r.therapist}
                    </Link>
                  </td>
                  {keys.map((k) => (
                    <td key={k} className="border-x border-border-strong/40 p-3 tabular-nums">
                      {r[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-4 md:hidden">
          {c.table.rows.map((r) => (
            <li key={r.therapy} className="border border-border-strong/40 p-4">
              <h2 className="text-lg">{r.therapy}</h2>
              <p className="text-fg-muted">{r.therapist}</p>
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                {keys
                  .filter((k) => r[k])
                  .map((k) => (
                    <div key={k} className="contents">
                      <dt className="text-fg-muted">{cols[k]}</dt>
                      <dd className="text-right tabular-nums">{r[k]}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {/* Packages: photo and centred text side by side, alternating sides */}
      <section aria-label={c.packages.map((p) => p.title).join(", ")} className="bg-canvas px-gutter pb-14 sm:pb-20">
        <ul className="mx-auto flex max-w-[72.25rem] flex-col gap-14 lg:gap-20">
          {c.packages.map((p, i) => (
            <li key={p.title} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
              <SiteImage image={p.image} sizes="(min-width: 1156px) 522px, (min-width: 768px) 45vw, 100vw" className={cn("w-full", i % 2 === 1 && "md:order-2")} />
              <div className="text-center font-heading text-sm">
                <h2 className="text-[1.875rem] font-normal text-fg sm:text-[2.375rem]">{p.title}</h2>
                <p className="mt-6">{p.lead}</p>
                <ul>
                  {p.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <p className="mx-auto mt-5 max-w-[24rem] leading-[1.9]">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Linen box: why work with us, Get in Touch, disclaimer */}
      <div className="bg-canvas px-gutter pb-14">
        <section aria-labelledby="cta" className="mx-auto max-w-site bg-linen px-5 py-10 sm:px-12 sm:py-12 lg:px-14">
          <h2 id="cta" className="font-heading text-[1.75rem] font-normal text-fg sm:text-[2.5rem]">
            {c.cta.title}
          </h2>
          <h3 className="mt-3 font-heading text-xl font-normal text-fg">{c.why.title}</h3>
          <Markdown source={c.why.body} size="lead" className="mt-4 font-heading" />
          <a href={c.cta.href} className={buttonClasses({ size: "sm", className: "mt-5" })}>
            {c.cta.label}
          </a>
          <h3 className="mt-10 font-heading text-lg font-normal text-fg">{c.disclaimer.title}</h3>
          <p className="mt-1 font-heading text-lead">{c.disclaimer.text}</p>
        </section>
      </div>

      <section className="bg-sand py-10" aria-label={t("gallery")}>
        <Gallery images={c.gallery} label={t("gallery")} prevLabel={t("galleryPrev")} nextLabel={t("galleryNext")} />
      </section>
    </>
  );
}
