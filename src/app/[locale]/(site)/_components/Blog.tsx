import { useTranslations } from "next-intl";
import { cn } from "@/design-system";
import { getCategories, getPage, type Post } from "@/content";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SiteImage } from "./SiteImage";

/** The blog's category menu (All Posts + the categories) as on the live post pages, current one marked. */
export function BlogNav({ current }: { current: string | null }) {
  const t = useTranslations("site.blog");
  const items = [{ href: "/blog", label: t("allPosts"), key: null as string | null }].concat(
    getCategories().map((c) => ({ href: `/blog/categories/${c.slug}`, label: c.name, key: c.slug })),
  );
  return (
    <nav aria-label={t("categories")} className="bg-canvas">
      <ul className="mx-auto flex max-w-[58.75rem] flex-wrap gap-x-6 px-gutter pt-4">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.key === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center font-heading text-base font-light underline-offset-8 hover:text-accent hover:underline",
                it.key === current ? "text-accent underline" : "text-fg-muted",
              )}
            >
              <CategoryLabel slug={it.key} fallback={it.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CategoryLabel({ slug, fallback }: { slug: string | null; fallback: string }) {
  const t = useTranslations("site.categoryNames");
  return <>{slug && t.has(slug) ? t(slug) : fallback}</>;
}

/** Blog title + intro, as at the top of the live blog page (green Jost capitals, centred intro). */
export function BlogIntro({ locale, heading }: { locale: Locale; heading?: React.ReactNode }) {
  const c = getPage("blog", locale);
  return (
    <div className="mx-auto max-w-[45rem] text-center">
      <h1 className="font-heading text-[1.5rem] font-light text-accent uppercase">{heading ?? c.title}</h1>
      <p className="mt-5 font-heading text-lg font-light">{c.intro}</p>
    </div>
  );
}

/**
 * A post in the blog grid, as on the live site: white bordered card, cover, title, excerpt (English, as on the site).
 * `recent` = the smaller "Recent Posts" card under a post (wider cover, title only).
 */
export function PostCard({ post, recent = false }: { post: Post; recent?: boolean }) {
  const href = `/post/${post.slug}`;
  const Title = recent ? "h3" : "h2";
  return (
    <article className="flex h-full flex-col border border-border-strong/30 bg-surface">
      {post.cover && (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <SiteImage image={{ src: post.cover, alt: "" }} sizes="(min-width: 1024px) 293px, (min-width: 640px) 50vw, 100vw" fill className={cn("w-full", recent ? "aspect-[293/163]" : "aspect-[293/220]")} />
        </Link>
      )}
      <div className={cn("flex flex-col px-6 pt-5", recent ? "pb-10" : "pb-7")}>
        <Title className="font-heading text-lg leading-snug font-light text-fg-muted" lang="en">
          <Link href={href} className="hover:text-fg hover:underline hover:underline-offset-4">
            {post.title}
          </Link>
        </Title>
        {!recent && (
          <p className="mt-3 line-clamp-5 text-sm leading-relaxed whitespace-pre-line text-fg-muted" lang="en">
            {post.excerpt}
          </p>
        )}
      </div>
    </article>
  );
}

export function PostList({ posts }: { posts: Post[] }) {
  const t = useTranslations("site.blog");
  if (!posts.length) return <p className="mt-12 text-center text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="mx-auto mt-8 grid max-w-[58.75rem] gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <li key={p.slug}>
          <PostCard post={p} />
        </li>
      ))}
    </ul>
  );
}

/** Blog pages: the category menu on category and post pages (not on the main blog page, as on the live site). */
export function BlogLayout({ current, nav = true, children }: { current: string | null; nav?: boolean; children: React.ReactNode }) {
  return (
    <>
      {nav && <BlogNav current={current} />}
      <section className="bg-canvas px-gutter pt-6 pb-16">{children}</section>
    </>
  );
}
