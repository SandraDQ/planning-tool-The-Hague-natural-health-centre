# Wix export

Export of the current Wix site (https://www.thehague-naturalhealthcentre.com) for the rebuild and redirects.

## Pages & screenshots

Made from the **public website only**: plain GETs and headless Chromium, no Wix API, no login, no forms submitted. Scripts live in `scripts/wix-export/` (Node ESM) and can be re-run from the repo root, in this order:

```
node scripts/wix-export/sitemap.mjs      # sitemap/
node scripts/wix-export/pages.mjs        # pages/*.md, _site-chrome.md, _media-by-page.json
node scripts/wix-export/events.mjs       # pages/events.json   (RETRY=1 redoes only failed events)
node scripts/wix-export/layout.mjs       # layout/, brand/tokens.json
node scripts/wix-export/fonts.mjs        # brand/fonts/
node scripts/wix-export/screenshots.mjs  # screenshots/
node scripts/wix-export/brand.mjs        # brand/ logos, favicon, notes.md
node scripts/wix-export/media-used.mjs   # media-used.json
```

Shared helpers are in `web.mjs`. Rendering waits for page load (network idle at most 10 s, Wix blog pages never go idle), scrolls to the bottom for lazy content, and hides the cookie banner with CSS (nothing is clicked). If the site serves a "Just a moment..." bot check, the scripts back off and retry.

| Output | What | Count | Size |
|---|---|---|---|
| `sitemap/` | `sitemap.xml` + 5 child sitemaps as served, and `urls.csv` (url,path,type,lastmod,title) | 309 URLs: 7 pages, 3 booking-services, 24 blog-posts, 8 blog-categories, 267 event-pages | 204 KB |
| `pages/<type>/<slug>.md` | Front matter (url, type, title, description, og_image, language, lastmod; blog posts also published + author) and the visible main text as Markdown, images as original `static.wixstatic.com` URLs with alt text | 42 sitemap URLs + 5 unlisted = 47 | |
| `pages/_site-chrome.md` | Header menu, header and footer once (opening hours, address, phone, email, social links) | 1 | |
| `pages/events.json` | One entry per event page: url, title, date_text, start/end, status, location, price_text, registration_text, summary, description (Markdown), image | 267, 0 failed | 844 KB |
| `pages/_media-by-page.json` | Every wixstatic image per rendered page, with area and background colour behind it | 47 pages | |
| `screenshots/` | Full-page PNGs, `<slug>-desktop.png` (1440 wide) and `<slug>-mobile.png` (iPhone 13) | 19 URLs x 2 = 38 | 66 MB |
| `layout/<page>/layout.md` + `section-NN.png` | Sections top to bottom: background colour/image, rows of blocks with x-position, headings, fonts, colours, buttons and links, images mapped to `media/manifest.json` | 13 pages (both home pages, about-us, services-1, contact, events, blog, booking, therapies, conditions, 3 booking services) | 17 MB (incl. navigation) |
| `layout/navigation.md` (+ `.json`, `navigation/*.png`) | Header/footer structure, menu items + colours + hover, sticky behaviour, mobile menu, floating elements | 5 screenshots | |
| `brand/` | Original logo files, favicons, `notes.md` (where each logo is used and on which colour, fonts, colours, Wix theme variables), `computed-styles.json`, `tokens.json` | 3 logos + 1 crop + 3 other logo variants in `logos/`, 3 favicon files | 1.9 MB |
| `brand/fonts/` | The font files the site loads, `fonts.css` with local `@font-face` rules, `typography.md/.json` (h1-h6, body, nav, footer, buttons, links; desktop and mobile) | 17 files, 28 `@font-face` rules | 488 KB |
| `media-used.json` | Every media id seen on live pages and events, with its pages and uses, mapped to `media/manifest.json` | 319 ids (201 on non-event pages; 34 not in the media export) | 244 KB |

Screenshot set: the 7 pages, 3 booking services, the first 3 blog posts in the sitemap, the first event page in the sitemap, and the 5 unlisted pages below.

### Things that failed or looked odd

- **Pages missing from the sitemap.** The main menu links to `/kopie-van-therapies` (Therapies) and `/kopie-van-conditions` (Conditions), which are not in any sitemap. Also linked but unlisted: `/therapies`, `/booking`, `/privacy`. They are exported as `pages/unlisted/` and listed in `pages/_unlisted-urls.txt`; add them to the redirect list.
- **Two home pages.** `/copy-of-meditation-video` (in the pages sitemap) also has the title "Home | The Hague Natural Health Centre ..." and a different design from `/`. The header logo and the "THE HAGUE / NATURAL HEALTH CENTRE" wordmark link there, not to `/`. Its "See therapies" button links back to itself. The owner should choose which one is the real home page. Both have layouts in `layout/`.
- `/blog` is listed in both the pages and blog-categories sitemaps, so it exists twice in `pages/`.
- **Mobile layout is 320px wide.** Wix serves `<meta name="viewport" content="width=320">` to phones, so mobile screenshots are 640px wide (320 CSS px x 2), not 390. On a real iPhone the 320px layout is scaled up.
- **Bot check.** The site briefly served a Cloudflare "Just a moment..." page to 9 of the 267 event renders (4 in parallel). They were retried one by one and all succeeded. The other scripts run 2 pages at a time.
- **Font licences.** The site uses Wix-licensed Monotype fonts (Futura LT, Avenir LT, Helvetica W01) and a custom upload `wfont_fdfc6f_9ffd...` whose original name is `orig_fsp_demo_blgnxtrlghtsmcndnsd_regular` (looks like a **demo** licence of "Bilgenext Light Semi Condensed"). It is used for the "THE HAGUE / NATURAL HEALTH CENTRE" wordmark. The files in `brand/fonts/` are for reference. Check the licences before self-hosting them; Lato is OFL and free. Roboto, Montserrat, Chivo and Gordita are loaded by third-party widgets (reviews, mailing list) and are not part of the site design. Two Roboto subsets have the same file name, so only one copy is kept.
- **Header wordmark is live text** in that custom font, not an image. The image logo is only the hummingbird. On Wix it is a crop of `a9a775_162d...~mv2.png`: `brand/logo-header-original.png` is the uncropped upload and `logo-header-cropped-as-shown.png` is the crop the site shows, at full resolution.
- 177 events have no ticket list (RSVP, past or unpublished ticketing). For those, `registration_text` holds what the page shows ("Tickets are not on sale", "Contact us", ...).
- 34 media ids used on the live site are not in `media/manifest.json`: 14 Wix stock images (`11062b_...`), 9 Wix/partner stock images (bare 32-hex ids), 3 Unsplash images (`nsplsh_...`), and 8 of the owner's own uploads (`3d01ac_`/`e8301f_`), probably deleted from the Media Manager but still referenced. `media-used.json` has their URLs (`in_media_export: false`).
- The layout analysis reads the rendered DOM. Block positions are reliable, but the "section name" is just the first heading. Third-party embeds (POWr mailing list, Google Maps, Google Reviews custom element, Wix Chat) are listed by name only.

### Personal data deliberately not saved

- **Google Reviews widget** (home page): reviewer names, photos and review texts are not exported. The widget is masked with a grey box in every screenshot.
- Blog comment sections, member/guest/attendee lists and avatars are skipped in Markdown and masked in screenshots. Event guest lists in the page data were never read.
- Kept, because they are the centre's own published content: practitioner names, bios and business contact emails/phones on the About and Therapies pages and in event descriptions (two external facilitators' emails appear in event texts), and one testimonial signed "Lucie, Rotterdam" on the home page.
