import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";

/** Public address of the site (set NEXT_PUBLIC_SITE_URL per environment). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.thehague-naturalhealthcentre.com").replace(/\/$/, "");

/** `/nl/about-us`, `/en/about-us` … for a path without locale ("/" = home). */
export function localePath(locale: Locale, path: string) {
  return `/${locale}${path === "/" ? "" : path}`;
}

export function languageAlternates(path: string) {
  return {
    ...Object.fromEntries(routing.locales.map((l) => [l, localePath(l, path)])),
    "x-default": localePath(routing.defaultLocale, path),
  };
}

/** Title, description, canonical URL, hreflang alternates and Open Graph for a public page. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  noindex,
}: {
  locale: Locale;
  path: string;
  title: string;
  description?: string;
  image?: string;
  noindex?: boolean;
}): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: title },
    description: description || undefined,
    alternates: { canonical: localePath(locale, path), languages: languageAlternates(path) },
    openGraph: {
      title,
      description: description || undefined,
      url: localePath(locale, path),
      siteName: "The Hague Natural Health Centre",
      locale: locale === "nl" ? "nl_NL" : "en_GB",
      type: "website",
      images: [image ?? "/brand/logo-footer-original.png"],
    },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

export function asLocale(locale: string): Locale {
  return (routing.locales as readonly string[]).includes(locale) ? (locale as Locale) : routing.defaultLocale;
}
