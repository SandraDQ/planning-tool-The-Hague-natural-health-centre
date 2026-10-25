import type { MetadataRoute } from "next";
import { getCategories, getEventPages, getPage, getPosts } from "@/content";
import { routing } from "@/i18n/routing";
import { SITE_URL, languageAlternates, localePath } from "./[locale]/(site)/_lib/metadata";

/** sitemap.xml: every public page in both languages, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; lastModified?: string; priority?: number }[] = [
    { path: "/", priority: 1 },
    { path: "/kopie-van-therapies", priority: 0.9 },
    { path: "/kopie-van-conditions", priority: 0.9 },
    { path: "/about-us", priority: 0.9 },
    { path: "/events", priority: 0.8 },
    { path: "/blog", priority: 0.8 },
    { path: "/contact", priority: 0.8 },
    { path: "/booking", priority: 0.6 },
    { path: "/services-1", priority: 0.5 },
    { path: "/privacy", priority: 0.3 },
    ...getPage("booking", "en").services.map((s) => ({ path: `/service-page/${s.slug}`, priority: 0.5 })),
    ...getCategories().map((c) => ({ path: `/blog/categories/${c.slug}`, lastModified: c.lastmod, priority: 0.4 })),
    ...getPosts().map((p) => ({ path: `/post/${p.slug}`, lastModified: p.lastmod, priority: 0.6 })),
    ...getEventPages().map((e) => ({ path: `/event-details-registration/${e.slug}`, lastModified: e.detail?.lastmod, priority: 0.4 })),
  ];

  const abs = (p: string) => `${SITE_URL}${p}`;
  return pages.flatMap(({ path, lastModified, priority }) => {
    const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([k, v]) => [k, abs(v)]));
    return routing.locales.map((locale) => ({
      url: abs(localePath(locale, path)),
      lastModified: lastModified || undefined,
      priority,
      alternates: { languages },
    }));
  });
}
