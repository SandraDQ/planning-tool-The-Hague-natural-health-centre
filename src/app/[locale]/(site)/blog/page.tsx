import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getPage, getPosts } from "@/content";
import { asLocale, pageMetadata } from "../_lib/metadata";
import { BlogIntro, BlogLayout, PostList } from "../_components/Blog";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const c = getPage("blog", locale);
  return pageMetadata({ locale, path: "/blog", title: c.meta.title, description: c.meta.description });
}

/** The Natural Health Blog: all posts, newest first. */
export default async function BlogPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <BlogLayout current={null} nav={false}>
      <BlogIntro locale={locale} />
      <PostList posts={getPosts()} />
    </BlogLayout>
  );
}
