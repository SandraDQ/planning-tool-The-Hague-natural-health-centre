# Phase 2 · Site rebuild: the current website in Next.js (D19)

*site-rebuilder agent · 25 Oct 2026 · status: ready for owner review (Dutch text is draft)*

D19 says to keep the current website as it is and add only login and online booking. This phase rebuilds every page of the live Wix site in Next.js. It uses the design system (`src/design-system/`, SiteHeader and SiteFooter) and the site's own text and images. "Book an appointment" and "Log in" go to placeholder pages, which other agents are now replacing with the real booking flow and login.

Since the first version of this handoff, the second export batch arrived: live screenshots, per-page `layout.md`, `brand/tokens.json` and `media-used.json`. Every page was rebuilt section by section against them: same section order, bands, boxes, spacing, pill buttons and footer. Side-by-side live/new pairs are in section 6.

## Checks

- **Typecheck, lint and build pass.** `pnpm typecheck` and `pnpm lint` report no errors; the only 2 lint warnings are in `scripts/wix-export/layout.mjs`. `pnpm build` passes in the shared tree and generates 172 pages.
- **Demo mode was checked separately.** The local `.env` switches demo mode off, so I also built a scratch copy without `.env` and tested sign-in there (section 11).
- **The screenshots came from an earlier scratch copy.** The shared build was broken by unfinished dashboard and scheduling work at the time.
- **Screenshots:** 68 shots (17 pages × nl/en × 390 and 1280). None has horizontal overflow or a broken image.

## 1. Pages and URLs

Every page exists as `/nl/...` and `/en/...`, with the same paths as on Wix. The code is in `src/app/[locale]/(site)/`.

| Page (menu) | New URL | Built after (live) | Notes |
|---|---|---|---|
| Home | `/{nl,en}` | `layout/home` | The owner confirmed `/` is the home page. Sections in live order: photo hero with logo, wordmark, tagline and Book button; sand "Nature inspired healthcare" band; "How can we help?" beside a photo; green quote box; stone "How to engage?" band with 3 therapists; "Accessible to all"; green "Never miss an event" box; map |
| Therapies | `/{locale}/kopie-van-therapies` | `layout/kopie-van-therapies` | Title, photo banner, intro, 15 linen therapy cards |
| Conditions | `/{locale}/kopie-van-conditions` | `layout/kopie-van-conditions` | Title, photo banner, 15 stone cards with round images, in the live order |
| About us | `/{locale}/about-us` | `layout/about-us` | Stone hero with an overlapping white card; story ("Read more" opens in place); round photo slider on sand; therapist grid; 12 profiles in alternating linen/white boxes with the site's anchors (`#sandra`, `#ira` …); Sustainable Living; newsletter; map |
| Events | `/{locale}/events` | `layout/events` | 12 linen event cards |
| Event page | `/{locale}/event-details-registration/<slug>` | screenshot | 16 event pages: 12 listed, 4 with full details. Photo + linen box hero, "Time & Location", "About the event", "Tickets" |
| Blog | `/{locale}/blog` | `layout/blog` | Title, intro, 3-column card grid with all 24 posts |
| Blog category | `/{locale}/blog/categories/<slug>` | screenshot | Category bar plus grid. 7 categories |
| Blog post | `/{locale}/post/<slug>` | screenshot | Category bar, bordered article box (940px), "Recent Posts" cards. Body in English on both languages |
| Contact | `/{locale}/contact` | `layout/contact` | Photo band with "Contact", underline-style form on the left, map on the right |
| Privacy | `/{locale}/privacy` | screenshot | Footer link |
| Pricing (unlisted) | `/{locale}/services-1` | `layout/services-1` | Linen intro box, price table with a dark header row, 3 packages alternating photo/text, linen "Empower yourself" box, round slider on sand |
| Consultations | `/{locale}/booking` | `layout/booking` | Rule-separated list: 84px round photo, title, tagline, Read More, duration/price, Book Now. On phones these become centred cards, as on the live site |
| Service page | `/{locale}/service-page/<slug>` | `layout/reiki-session` | homeopathy-initial-consultation, homeopathy-follow-up-consultation, reiki-session |
| **Book an appointment** (new) | `/{locale}/book` | – | Minimal placeholder, `noindex`. The real booking flow is being built there by another agent |
| **Log in** (new) | `/{locale}/login` | – | Minimal placeholder, `noindex`. The real login is being built there by another agent |

`copy-of-meditation-video` (the old "centre" page) is **removed**. The owner confirmed the real home is `/`, so it now redirects to the home page (section 3).

Content:
- Page text: `src/content/pages/<page>.{en,nl}.json`. TypeScript checks that both languages have the same keys (`pair()` in `src/content/index.ts`).
- Blog: `src/content/blog/` (Markdown posts, plus `posts.json` and `categories.json`).
- Events: `src/content/events.json`.
- Image sizes: `src/content/media.json`, read through `src/content/media.ts`. That module has no Node imports, so client components (the photo slider) can use `SiteImage`.
- Shared UI strings: the `site` namespace in `messages/*.json`.

SEO (`src/app/[locale]/(site)/_lib/metadata.ts`):
- Each page uses the Wix title and description.
- Each page has a canonical URL, hreflang for nl, en and x-default (nl), and Open Graph tags.
- The site URL comes from `NEXT_PUBLIC_SITE_URL`; the default is https://www.thehague-naturalhealthcentre.com.
- `src/app/sitemap.ts` lists every page in both languages, with alternates.
- `src/app/robots.ts` disallows `/design`, `/login` and `/book`.

## 2. Language decision

**English gets the original text, and old Wix URLs redirect to `/en/...`.** The live site is English only, so anyone following an old link or a Google result gets the page they expect.

Dutch (`nl`, still the default locale) is a full draft translation. The root `/` uses next-intl's browser-language detection and falls back to `/nl`.

The 24 blog posts and the event descriptions are **not** translated. On `/nl` they show in English, marked `lang="en"`, with a short Dutch note.

All **362** drafted Dutch strings are in `handoffs/phase2-site-rebuilder-nl-drafts.md` for approval. The list is regenerated after this round; it includes the new event labels "Tijd en locatie", "Over het evenement" and "Tickets", and the header and booking labels "mijn omgeving", "Uitloggen", "Boeken" and "Afspraak maken".

## 3. Redirect map (old Wix URL → new)

All are permanent (308) redirects in `next.config.ts`.

| Old Wix URL | New URL |
|---|---|
| `/kopie-van-therapies`, `/kopie-van-conditions`, `/about-us`, `/events`, `/blog`, `/contact`, `/privacy`, `/services-1`, `/booking` | `/en` + same path |
| `/copy-of-meditation-video` | `/` (home); `/{nl,en}/copy-of-meditation-video` → `/{locale}` |
| `/therapies` (old unlisted page) | `/en/kopie-van-therapies` (and `/{nl,en}/therapies` → `/{locale}/kopie-van-therapies`) |
| `/blog/page/<n>` | `/en/blog` (all posts are on one page) |
| `/blog/categories/<slug>` | `/en/blog/categories/<slug>` |
| `/post/<slug>` | `/en/post/<slug>` |
| `/service-page/<slug>` | `/en/service-page/<slug>` |
| `/booking-calendar/*` | `/en/book` |
| `/event-details-registration/<slug>` for one of the 16 known events | `/en/event-details-registration/<slug>` |
| any other `/event-details-registration/*` (the ~250 past occurrences in urls.csv) | `/en/events` |
| `/event-info/*` | `/en/events` |
| `/` | next-intl: `/nl` or `/en` by browser language (307) |

Unknown paths return 404.

## 4. Look and design-system changes

**Fonts are unchanged.** They are the open look-alikes Lato, Jost and Antonio. The Wix font files are not used (coordinator's decision).

**Tokens (`tokens.css`), from `brand/tokens.json`:**
- New colours `taupe` (#9f8c82, titles), `stone` (#bfb4ae, bands and cards) and `linen` (#efece2, cards and boxes), with dark-mode values.
- New type sizes `text-title` (26–36px) and `text-lead` (19–24px).
- `--container-site: 61.25rem` (the site's 980px column).

**Buttons are pills (`rounded-full`), as on the live site.**

**SiteHeader:**
- 120px, logo plus the green two-line wordmark, menu on the right in Lato Light; the current page is shown in brown, underlined.
- The logo links home.
- Between 1280 and 1535px the Book button shows "Book" so the row fits; its accessible name stays "Book an appointment".

**SiteFooter:**
- White with a thin top line, everything in brand green.
- Opening hours ("Monday appointment only"), contact details, a "Send us a message" pill, and social links underlined, one per line.
- A centred line with copyright, credit and Privacy.
- Centred on phones, as on the site.

**`DisplayHeading`** (condensed taupe capitals) has a `caps={false}` option for the few titles in normal case: "How can we help?", "Sustainable Living" and "Privacy".

**Contrast choices.** These are deliberate differences from the live site, made to pass WCAG AA:
- **Buttons** use full brand green. The live site uses green at 80%, where white text is only 3.7:1.
- **The newsletter box** is solid green. Its Wix stock background photo isn't in the backup.
- **Small taupe text** (the privacy questions, the nature band text) uses the darker `fg-muted` brown. Taupe on white is 3.2:1, which is fine only for large titles.
- **The home hero** keeps the photo, with a light dark veil and light text.

**Left out:**
- The Google Reviews widget (the grey box on the live home page).
- The POWR mailing-list popup.
- The Wix "Contact Us" chat bubble.
- The blog comments and share icons.

## 5. Images

`public/media/` holds the **177** images the pages use (44 MB), resized to at most 1600px. I removed 10 that are no longer used: images of the deleted centre page, plus a pricing background that isn't shown. `media-used.json` confirmed most picks. The pricing packages are re-paired with the right photos: Vitality Taster has the family, Energy Renewal the beach, Deep Healing the hug.

**Still unconfirmed.** These Wix stock photos aren't in the media backup, so one of your own images stands in. Please confirm each, or send the original:

| Where | Wix image (not in backup) | Used instead (`public/media/_root/…`) |
|---|---|---|
| Home "Accessible to all" | family at the beach (60c44e41) | `WhatsApp-Image-2025-10-21-at-08.23.50__f3b7ed77.jpeg` (talk photo) |
| Home/About "Never miss an event" | background stock (11062b_f347614c) | plain green box |
| Therapies: Reiki | 11062b_89a3c762 | `Reiki__1aee6849.jpeg` |
| Therapies: Acupuncture | stock 5317450615 | `Screenshot-2026-08-13-at-22.02.46__792f0a87.png` |
| Therapies: Chinese Herbalism | stock 63f16ba8 | `Screenshot-2023-11-29-at-13.04.40__90c125dc.png` |
| Ira (home and about) | e8301f_5a623acf | `Ira-Sloof__93fd0026` |
| Cynthia Ramirez | e8301f_2782e749 | `DSCF0741_edited__4238e46c` |

Blog images missing from the backup, and left out of their posts:
- 1 inline image in *Ayurvedic Tips for Healthy Babies*.
- 3 inline images in *The Creative and Imaginative Parent*.
- The cover of *Finding Balance with Fungi and Candida*. It uses the first image in the post (Audrey's portrait) instead.

## 6. Side-by-side pairs

Everything is in `/mnt/project-files/thnhc-plan/site-v1/`.

- **All new screenshots:** `<page>-<nl|en>-<mobile|desktop>.png`. These are 17 pages at 390×844 and 1280×800, full page.
- **`compare/`** has 13 pages that have a live capture, at desktop and mobile:
  - `<page>-live-<vp>.png`: the Wix capture (1440 wide, or the mobile capture).
  - `<page>-new-<vp>.png`: the new site, in English.
  - `<page>-compare-<vp>.jpg`: live on the left, new on the right, scaled to the same width. Very long mobile pages are cut at 16,000px.
- The 13 pages are home, therapies, conditions, about-us, events, event-detail, blog, post, contact, privacy, services-1, booking and service-page.
- **Matching captures:**
  - The post pair uses *Let's talk about Anxiety*.
  - The event pair uses *Free Learning Series: Natural Remedies for the Home*.
  - The service pair uses *Reiki Session*.
  - The live set has no capture of a blog category page, of `/book`, or of `/login`.

## 7. Differences still open

- **Pixel spacing.** Layout follows `layout.md`, but spacing uses design-system steps, not Wix's exact pixels. The live captures are 1440 wide and ours are 1280, so fixed-height bands (like the contact photo band) look taller in the scaled pairs.
- **Blog listing.** The blog shows all 24 posts on one page; Wix pages them 6 at a time.
- **Blog category bar.** The bar wraps onto two lines, where Wix folds extra categories into "More".
- **Event pages:**
  - Full descriptions show in full. Wix cuts them off with "More details".
  - "Tickets" is a box with the price or registration note and a "Reserve your place" button, which goes to Contact until online ticketing exists.
  - 12 of the 16 events have no detail text in the export, so they show the date, image and "details coming soon".
  - The Wix "Other dates" chips aren't in the export.
- **Service page.** "Book Now" is a pill; on Wix it is square here.
- **Blog categories.** The export captured only one post per category, so each category page lists one post. A re-export or the read-only Wix Blog API can fill these in.
- **Pricing page (`services-1`) looks outdated.** It still lists Luc Hofmans and Archana Munot. Where the table has a single value, it sits under "initial consult". Please review it.
- **Event dates** come from the export. Past events stay listed until the events data is updated.

## 8. Changes to flag: where the rebuild differs from Wix on purpose

**Therapist contact buttons.** The links were checked against the live About page.
- Labels fixed where Wix showed the wrong person:
  - "Whatsapp Amanda" now says Priyanka or Lysanne.
  - "Whatsapp Melanie" under Valeria now says Valeria.
  - "for Hella" now says Cynthia.
  - Priyanka's email subject now says "for Priyanka".
- Aurora's phone number is normalised.
- **Cammi's buttons are left out.** On Wix they point to Nadia's email and phone.

**Links.** The therapy grid points to `/kopie-van-therapies`. The About buttons scroll to `#story` and `#therapists`.

**Text.**
- English is verbatim. The only changes are restored spaces that Wix lost at text boundaries.
- HTML entities removed from one post.
- The Tissue Salts table is a real table again.
- The privacy questions are real headings.

**Meta and indexing.**
- The Conditions page's English title is "Therapies | …". That is a Wix bug, kept verbatim.
- The privacy meta description had been copied from another clinic, so I replaced it.
- The privacy text still describes Wix and needs a review.
- Wix had `noindex` on Therapies, Conditions, booking and privacy. Those pages are now indexable.

**Forms.** The newsletter and contact forms open the visitor's email app (mailto) until the platform has a backend.

**Map.** The Google map loads only after the visitor clicks "Show map", for privacy. "Open in Google Maps" is always there.

## 9. Files changed outside the page folders

- `src/app/[locale]/page.tsx` **deleted.** It was the old placeholder home; the home page is now `(site)/page.tsx`.
- `src/app/globals.css`: `@source not "../content";`, so Tailwind doesn't read blog Markdown as class names.
- `src/design-system/`:
  - Tokens (section 4).
  - Pill buttons.
  - SiteHeader, SiteNavLinks, BrandLink and SiteFooter restyled to the live header and footer.
  - `SiteSection` and `DisplayHeading` (`components/SiteSection.tsx`).
  - Mail, Phone, MessageCircle and ExternalLink icons.
- `src/content/media.ts` (new): the media sizes, without Node imports.
- `next.config.ts`: redirects only.
- **Recommendation:** `siteActions.book` in `src/design-system/site.ts` is still `/booking`. The header gets `bookHref="/book"` passed in. It should become `/book`.

## 10. How to test

```
pnpm build && pnpm start       # once the dashboard/scheduling work in progress compiles
curl -I localhost:3000/about-us                   # 308 → /en/about-us
curl -I localhost:3000/copy-of-meditation-video   # 308 → /
open localhost:3000/nl  localhost:3000/en/post/the-art-anchor
```

Scratch tools, not part of the repo, in `/tmp/…/scratchpad/`:
- `shots.js`: screenshots.
- `pairs.js`: live/new pairs.
- `nldrafts.py`: the Dutch draft list.
- `media.js`: copies images and writes `media.json`.

The content generator (`gen.py`) doesn't include the hand fixes, so edit `src/content/` directly from now on.

## 11. Follow-up: links to the booking flow and signed-in header

**Booking links.** They live in `src/app/[locale]/(site)/_lib/booking.ts`.
- The header and hero "Book" buttons go to `/book`.
- **Therapies page:** each therapy card has a "Book" pill that goes to `/book/therapy/<id>` when the booking catalogue has that therapy. The ids come from `src/lib/server/demo/seed.ts`, matched on the English title.
  - Matched: Homeopathy, Acupuncture, Jungian Psychology → psychology, massage, Chinese Herbalism, Reiki, Ayurveda, Nutrition.
  - The rest go to `/book`. In the demo data, High Power Laser, Shamanism and Orthomolecular have no bookable service, so their pages say "We couldn't find that".
- **Old `/booking` page and service pages:** same look; "Book Now" goes to `/book/therapy/therapy-homeopathy` (both homeopathy consultations) or `/book/therapy/therapy-reiki`.
- **Therapist cards:** the home "How to engage?" cards (beside WhatsApp) and the About profiles each have a Book button. These go to `/book` for now, because the demo catalogue has none of the centre's real therapists. Once they are in the catalogue, add each slug to `THERAPIST_SLUGS` in `_lib/booking.ts`.

**Signed-in header:**
- `SiteShell` (server component) reads `getSession()`.
- When signed in, "Log in" becomes the person's first name, linking to `/admin`, `/therapist` or `/account`. The name is read out as "Anna, my account".
- A "Log out" button (`signOutAction`) sits next to it: an icon on desktop, a text button in the menu sheet.
- `SiteHeader` only gets new props (`account.hint`, `accountActions`). It never reads the session itself.
- Tested in demo mode: sign in, see the name, log out. No overflow from 360 to 1536px.

## Open questions for the owner

1. Approve or correct the Dutch drafts (`phase2-site-rebuilder-nl-drafts.md`).
2. Confirm the substitute images in section 5, or send the originals.
3. Cammi's email and WhatsApp.
4. Should the pricing page (`services-1`) stay online? It is unlisted on Wix and looks outdated.
5. Should Therapies, Conditions, booking and privacy be indexed by Google? They were `noindex` on Wix.
