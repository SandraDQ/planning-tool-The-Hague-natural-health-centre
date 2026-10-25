/**
 * Content of the current website's header and footer, taken from
 * wix-export/pages/_site-chrome.md (D19: keep the site as it is).
 * Labels are translated in messages/*.json under `design.site`; the
 * values that are the same in every language (address, phone, links) live here.
 *
 * URLs keep the current site's paths so existing links and search results keep working.
 */

export type SiteNavKey = "home" | "therapies" | "conditions" | "about" | "events" | "blog" | "contact";

export const siteNav: { key: SiteNavKey; href: string }[] = [
  { key: "home", href: "/" },
  { key: "therapies", href: "/kopie-van-therapies" },
  { key: "conditions", href: "/kopie-van-conditions" },
  { key: "about", href: "/about-us" },
  { key: "events", href: "/events" },
  { key: "blog", href: "/blog" },
  { key: "contact", href: "/contact" },
];

/** New (D19): online booking and the platform login. */
export const siteActions = {
  book: "/book", // new online booking flow (the old /booking page links here too)
  login: "/login",
};

export type OpeningDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** As listed on the site. `hours` null = see `note` (by appointment / closed). */
export const openingHours: { day: OpeningDay; hours: string | null; note?: "appointment" | "closed" }[] = [
  { day: "mon", hours: null, note: "appointment" },
  { day: "tue", hours: "09 - 17h" },
  { day: "wed", hours: "09 - 17h" },
  { day: "thu", hours: "09 - 17h" },
  { day: "fri", hours: "09 - 17h" },
  { day: "sat", hours: null, note: "appointment" },
  { day: "sun", hours: null, note: "closed" },
];

export const siteContact = {
  name: "The Hague Natural Health Centre",
  address: "Badhuisstraat 224, 2584 HN, The Hague",
  mapUrl: "https://www.google.com/maps/place/Badhuisstraat+224,+2584+HN+Den+Haag,+Netherlands/@52.1034005,4.2793489,17z",
  email: "info@thehague-naturalhealthcentre.com",
  emailHref: "mailto:info@thehague-naturalhealthcentre.com?subject=Website%20enquiry",
  phone: "+31 6 23 32 87 57",
  phoneHref: "tel:+31623328757",
};

export const siteSocial = [
  { name: "Facebook", handle: "@thehaguenaturalhealthcentre", href: "https://www.facebook.com/profile.php?id=61558748492110" },
  { name: "Instagram", handle: "@thehaguenaturalhealthcentre", href: "https://www.instagram.com/thehaguenaturalhealthcentre" },
  {
    name: "LinkedIn",
    handle: "@thehaguenaturalhealthcentre",
    href: "https://www.linkedin.com/company/the-hague-natural-health-centre/",
  },
] as const;

export const siteLegal = {
  copyright: "©2023 The Hague Natural Health Centre",
  credit: "Design by Sustainable Web Design",
  privacy: "/privacy",
};

/** The live text the site shows next to the hummingbird (brand name, not translated). */
export const siteWordmark = {
  name: "Natural Health Centre",
  place: "The Hague",
};
