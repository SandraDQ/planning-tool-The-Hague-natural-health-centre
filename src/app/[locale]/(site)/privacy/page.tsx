import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { DisplayHeading, SiteSection } from "@/design-system";
import { getPage } from "@/content";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { Markdown } from "../_components/Markdown";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("privacy", locale);
  return pageMetadata({ locale, path: "/privacy", title: c.meta.title, description: c.meta.description });
}

/** Privacy: the current site's privacy text, unchanged (it still describes Wix; see the handoff). */
export default async function PrivacyPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const c = getPage("privacy", locale);
  const [first, ...rest] = c.body.split("\n\n");
  // The site's questions ("How is information collected?") are plain lines there; here they are headings.
  const body = rest.map((b) => (b.length < 70 && !b.includes("\n") && !/[.:]$/.test(b) ? `### ${b.replace(/^#+\s*/, "")}` : b)).join("\n\n");
  return (
    <SiteSection width="wide" padded={false} innerClassName="pt-12 pb-16 sm:pt-16 sm:pb-20">
      <div className="mx-auto max-w-[58.75rem]">
      <DisplayHeading as="h1" caps={false} className="text-center">
        {first.replace(/^#+\s*/, "")}
      </DisplayHeading>
      {/* Questions in the site's lighter brown, Jost (contrast: fg-muted, not the live #9f8c82) */}
      <Markdown source={body} size="sm" className="mt-8 text-sm [&_h3]:mt-3 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-light [&_h3]:text-fg-muted" />
      </div>
    </SiteSection>
  );
}
