import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Icons } from "@/design-system";
import { getPost, getPostBody, getPosts } from "@/content";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { asLocale, pageMetadata } from "../../_lib/metadata";
import { postDate } from "../../_lib/dates";
import { Markdown } from "../../_components/Markdown";
import { BlogNav, PostCard } from "../../_components/Blog";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => getPosts().map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  const p = getPost(slug);
  if (!p) return {};
  return pageMetadata({ locale, path: `/post/${p.slug}`, title: p.seoTitle, description: p.description || p.excerpt, image: p.cover ?? undefined });
}

/** A blog post (same URL as on the Wix site). Posts are English only, as on the site. */
export default async function PostPage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = asLocale(l);
  setRequestLocale(locale);
  const post = getPost(slug);
  if (!post) notFound();
  const t = await getTranslations("site.blog");
  const body = getPostBody(post.slug);
  const minutes = post.readTime.match(/\d+/)?.[0];
  const recent = getPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);

  return (
    <>
      <BlogNav current={null} />
      <div className="bg-canvas px-gutter pt-4 pb-16">
        {/* The live post: a white bordered box, 940px wide, text column 740px */}
        <article className="mx-auto max-w-[58.75rem] border border-border-strong/30 bg-surface px-5 py-10 sm:px-12 sm:py-14 lg:px-24" aria-labelledby="post-title">
          <p className="text-xs text-fg-muted">
            {post.author && <span>{post.author} · </span>}
            <time dateTime={post.published}>{postDate(post.published, locale)}</time>
            {minutes && <span> · {t("readMinutes", { minutes })}</span>}
          </p>
          <h1 id="post-title" className="mt-4 font-heading text-[1.75rem] leading-tight font-light text-fg-muted sm:text-[2rem]" lang="en">
            {post.title}
          </h1>
          {locale !== "en" && <p className="mt-4 bg-surface-2 px-4 py-3 text-sm">{t("englishOnly")}</p>}
          <div lang="en" className="mt-8 border-b border-border-strong/30 pb-10">
            <Markdown source={body} />
          </div>
          <Link href="/blog" className="mt-6 inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted underline-offset-4 hover:text-accent hover:underline [&_svg]:size-4">
            <Icons.ChevronLeft aria-hidden="true" />
            {t("backToBlog")}
          </Link>
        </article>

        <section className="mx-auto mt-10 max-w-[58.75rem]" aria-labelledby="recent-title">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-title" className="font-heading text-lg font-light text-fg-muted">
              {t("recentPosts")}
            </h2>
            <Link href="/blog" className="inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 hover:text-accent hover:underline">
              {t("seeAll")}
            </Link>
          </div>
          <ul className="mt-3 grid gap-6 md:grid-cols-3">
            {recent.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} recent />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
