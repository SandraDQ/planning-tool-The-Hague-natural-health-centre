import type { MetadataRoute } from "next";
import { SITE_URL } from "./[locale]/(site)/_lib/metadata";

/** robots.txt: the public site is indexable; design previews and the placeholder screens are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/nl/design", "/en/design", "/nl/login", "/en/login", "/nl/book", "/en/book"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
