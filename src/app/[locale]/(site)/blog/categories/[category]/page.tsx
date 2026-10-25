import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCategories, getCategory, getPage, getPost, type Post } from "@/content";
import { routing } from "@/i18n/routing";
import { asLocale, pageMetadata } from "../../../_lib/metadata";
import { BlogIntro, BlogLayout, PostList } from "../../../_components/Blog";

type Props = { params: Promise<{ locale: string; category: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => getCategories().map((c) => ({ locale, category: c.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: l, category } = await params;
  const locale = asLocale(l);
  const cat = getCategory(category);
  if (!cat) return {};
  const t = await getTranslations({ locale, namespace: "site.categoryNames" });
  const c = getPage("blog", locale);
  return pageMetadata({ locale, path: `/blog/categories/${cat.slug}`, title: t(cat.slug), description: c.meta.description });
}

/** A blog category (same URL as on the Wix site). */
export default async function CategoryPage({ params }: Props) {
  const { locale: l, category } = await params;
  const locale = asLocale(l);
  setRequestLocale(locale);
  const cat = getCategory(category);
  if (!cat) notFound();
  const posts = cat.posts.map((s) => getPost(s)).filter((p): p is Post => Boolean(p));
  return (
    <BlogLayout current={cat.slug}>
      <BlogIntro locale={locale} />
      <PostList posts={posts} />
    </BlogLayout>
  );
}
