# Phase 2 · Design system v2: re-themed to the current website (D19)

*design-system agent · 25 Oct 2026 · status: ready for owner review*

D19 says to keep the current website as it is and add only login and online booking. The design system now uses the current site's logo, colours, fonts and flat look instead of the Apple-style theme. Section 8A's usability rules still apply: 44px tap targets, WCAG AA, mobile first, plain language and reduced motion.

## What changed

### 1. Logo (original files, unchanged)
Copied byte-for-byte from `wix-export/brand/` to `public/brand/`. The SHA-256 of each copy matches its source; the hashes are in `public/brand/README.md`. The files served by `next start` also match the source.

| Use | File | How it is shown |
|---|---|---|
| Header (`<Logo variant="mark">`) | `logo-header-cropped-as-shown.png` (891×1077) | The file the site serves in its header, shown 72px high on desktop like the site |
| Footer (`<Logo variant="full">`) | `logo-footer-original.png` (1563×1563, transparent) | The site frames this file with a display crop (`x73 y182 w1409 h1172`); outside that frame there is only transparent margin. We repeat the same frame with a CSS window and do not edit the file. Shown 151px high, as on the site |
| Favicon | `favicon-original.png` | `src/app/icon.png` is an exact copy. `favicon.ico` (16/32/48) and `apple-icon.png` (180) are resized copies |

`src/design-system/brand.ts` now holds `brand.mark`, `brand.full` and `brand.favicon`, with the site's alt texts. Images are served `unoptimized`, so they are never re-encoded. The logo placeholder is gone.

### 2. Colours: `src/design-system/tokens.css`
Colours are taken from `notes.md` and `computed-styles.json`; the Wix `--color_N` source is noted beside each value.

| Token | Value | Source / use |
|---|---|---|
| `canvas` / `surface` | #ffffff | Page background (the site is mostly white) |
| `surface-2` | #f4f3eb | Cream bands, hover |
| `sand` (new) | #e8e4d5 | Footer and sand bands (`color_27`) |
| `fg` | #352f2b | Text (`color_15`) |
| `fg-muted` | #6a5d57 | Secondary text (`color_14`) |
| `brown` (new) | #857166 | Site brown: large text and decoration only |
| `border` / `border-strong` | #e8e4d5 / #9f8c82 | Lines / input outlines |
| `accent` / `accent-strong` | #486f55 / #3b5241 | Brand green, the site's main colour (`color_19/20`) |
| `accent-soft` | #dde7df | #799382 at about 25% on white: selected states, room blocks |
| `sage` (new) / `on-sage` | #799382 / #fff | Sage band (`color_18`) |
| success / warning / danger | #3b6b4a / #7a5410 / #9c3a2e | Not on the site; muted to fit the palette |

**Contrast adjustments (WCAG 2.1 AA):**
- **#857166 (site brown):** 4.6:1 on white but only 4.2:1 on cream, so it **fails** as body text on cream. Secondary text uses the site's own #6a5d57 instead (6.3 on white, 5.7 on cream, 5.0 on sand). #857166 is kept only as `brown`, for large text.
- **#9f8c82 (taupe):** 3.2:1, so **fails** for text. It is used for lines and input outlines only, where it passes the 3:1 rule for UI parts.
- **#799382 (sage) with white text:** 3.3:1, so it passes for **large text only** (24px and up). The home page quote on the sage band is 28px. Body text on a coloured band goes on the brand green instead (white on #486f55 is 5.7:1).
- **#486f55 green as small text on sand #e8e4d5:** 4.48:1, which just **fails**. Links in the sand footer use dark text with an underline and turn #3b5241 on hover (6.7+:1).
- **All other pairs pass.** Text on white is 13.2:1. Green on white is 5.7:1 and on cream 5.1:1. White on green is 5.7:1. Semantic colours on their soft backgrounds are 5.2 to 5.8:1. All dark-theme pairs are 7:1 or more.

**Dark mode decision: light is the default and dark is opt-in only.** The current site has no dark mode, so the device's dark setting is no longer followed. Dark turns on only with `<html data-theme="dark">`; the ThemeToggle now offers Light and Dark, and the choice is stored in `localStorage`. The dark palette uses the site theme's own dark browns (#27211e, #312824, #f3f1eb, #cfc5c1, #a2b7a9). It looks acceptable for the internal dashboards. However, the logo's dark outlines get lost on dark backgrounds, so in dark mode the full logo sits on a cream plate (the file itself is unchanged). The header hummingbird stays readable through its green fill. My advice is to use dark only for staff screens, never for the public site.

### 3. Fonts: `src/design-system/fonts.ts` and `src/design-system/fonts/`
Fonts are self-hosted with `next/font/local`. The woff2 files (latin subset) come from `@fontsource` 5.3.0 and sit in the repo with their OFL licence files. **No new npm packages:** `package.json` is unchanged and the build needs no network. Font variables go on `<html>` in `src/app/[locale]/layout.tsx`.

| Site font | Licence situation | Replacement (all SIL OFL 1.1) | Tailwind |
|---|---|---|---|
| `lato-light` (body, 36 elements) | Lato is open (OFL); Wix only hosts it | **Lato** 300 (+ italic), 400, 700: the same family | `font-sans` (body is 300) |
| `futura-lt-w01-light` / `-book` (headings, nav, logo-style text) | Futura is a commercial font licensed through Wix for use on Wix only | **Jost** 300 / 400 / 500, an open Futura-style geometric | `font-heading` (h1–h3 by default) |
| `orig_fsp_demo_blgnxtrlghtsmcndnsd` (custom upload, 10 elements) | The file name reads as "FSP DEMO – **Balgin ExtraLight SemiCondensed**". "FSP demo" is a Fontspring demo file, normally licensed for personal use or testing only, **not** for a commercial website | **Antonio** 100 / 200, the closest open match | `font-display` (uppercase section titles in green) |

To pick the display font, I rendered Antonio, Sofia Sans / Saira / Barlow / Encode Sans Semi Condensed, Josefin Sans and Jost next to the lettering in the footer logo. Antonio Thin/ExtraLight is closest in width and proportion (tall, narrow, thin strokes). I am assuming that the uploaded font is used for the big section titles ("NATURE INSPIRED HEALTHCARE", "ACCESSIBLE TO ALL", "NEVER MISS AN EVENT"). The export does not say which 10 elements use it; the page screenshots will confirm this.

Type sizes stay at five, now matched to the site's steps: 14 / 17 (body and menu) / 20 (site h3) / 28 (site `--font_2`) / 36–55 (hero; the site's h2 is 55px).

### 4. Components re-styled
- **Flat, square-ish shapes like the site.** Radius tokens are now xs 2 / sm 3 / md 4 / lg 6px, replacing 12–20px; this overrides 8A, per D19. Cards are flat with a sand line, with no shadow and no lift on hover. Shadows remain only on sheets and toasts.
- **Buttons.** Primary is flat brand green with Lato text. Secondary is a green outline. Ghost is a green text link. A new `sm` size keeps the 44px height with less side padding.
- **Headings** use Jost 400 with no bold, as on the site. `font-semibold` was removed from component headings (Sheet, EmptyState, DatePicker, RadioCardGroup legend, Avatar).
- **LanguageSwitch** is restyled like the menu: NL/EN letters with the active one green and underlined, still 44px targets.
- **`Header`** (slim header for non-site screens) is now solid white, with no frosted glass, and uses the new `BrandLink`.
- **New `BrandLink`:** the hummingbird plus "NATURAL HEALTH CENTRE / THE HAGUE" as live text, as on the site. Below 380px the name is visually hidden so the header fits; it stays the link's accessible name.
- **New `SiteHeader`** reproduces the current site's header from `_site-chrome.md`. The menu is Home, Therapies, Conditions, About us, Events, Blog, Contact, in Lato Light, with the current page in green and underlined. It keeps the **current URLs** (`/kopie-van-therapies`, `/kopie-van-conditions`, `/about-us`, …). The site's automatic "More" item is left out. **Added items:**
  - a "Log in" link (`/login`); pass `account={{label, href}}` and it becomes the signed-in person's name.
  - a green **"Afspraak maken / Book an appointment"** button (`/booking`, the current site's booking URL). On phones it is shortened to "Boeken / Book".
  - the NL/EN switch.

  Desktop layout: the brand row with language, log in and Book, then the menu row underneath. Phones and tablets: logo, Book and a menu button; the menu sheet holds the links, log in and language.
- **New `SiteFooter`** reproduces the site footer on sand:
  - the full logo, which links home.
  - opening hours (Mon by appointment, Tue–Fri 09–17h, Sat by appointment, Sun closed).
  - contact: name, address linking to Maps, email, phone "(Answerphone or Whatsapp)" and "Send us a message".
  - Facebook, Instagram and LinkedIn.
  - "©2023 The Hague Natural Health Centre | Design by Sustainable Web Design" and Privacy.
- **New `src/design-system/site.ts`** holds the header and footer content (menu, opening hours, contact, social links, legal line) in one place for the website agent. Labels are in `messages/*.json` under `design.site`.
- **`globals.css`:**
  - the body is Lato Light and headings are Jost.
  - added `@source not "../../wix-export";`. Tailwind was scanning the newly merged Wix markdown and generating invalid CSS from it (`[ref:[https…](…)]`), which **broke `pnpm build`** for everyone.

### 5. Mock-ups (`/nl|en/design/...`)
- **`/design/home`** is now the **current home page**: the same sections, order and text from `home.md`. The English is the site's text; the Dutch is my draft translation. Sections:
  - hero: logo, THE HAGUE, NATURAL HEALTH CENTRE, "Helping people feel Confident, Healthy, Energized".
  - Nature inspired healthcare.
  - How can we help? with See therapies.
  - the quote on the sage band.
  - How to engage? with Sandra, Ira and Audrey.
  - Accessible to all.
  - Never miss an event, with the mailing-list form on green.
  - the map.

  Additions: Book buttons in the hero and under each therapist. Photos and the map are labelled placeholders until the media export lands.
- **`/design/choose-time`** and **`/design/therapist-calendar`** use `SiteHeader` and `SiteFooter`. The calendar shows the signed-in state ("Sophie de Vries" instead of Log in).
- **`/design`** (showcase): the new logo, the colours with their hex values, the three typefaces, Light/Dark toggle, and the site header and footer.

## How to test
```
pnpm typecheck && pnpm lint && pnpm build   # all pass
pnpm start   # /nl/design, /nl/design/home, /en/design/home, /nl/design/choose-time, /nl/design/therapist-calendar
```
No sideways scrolling at 360px (checked).

## Screenshots: `/mnt/project-files/thnhc-plan/mockups-v2/`
- **Pages:** `showcase`, `home`, `choose-time` and `therapist-calendar` (NL), plus `en-home` and `en-choose-time`.
- **Per page:** `<page>-mobile.png` (390 wide @2x, full page), `-mobile-screen.png` (first screen, 390×844), `-desktop.png` (1280 wide, full page) and `-desktop-screen.png` (1280×800).
- **Extra:** `home-mobile-menu.png` (phone menu sheet) and `showcase-desktop-dark.png` (opt-in dark).

## Not verified yet (waiting for the page screenshots from the export thread)
No screenshots of the live site existed when I started (`wix-export/screenshots/` was missing), so these points were inferred from the computed styles. Each one is a one-line token change once the screenshots are in:
1. **Footer background.** I chose sand (#e8e4d5); its area in the colour data fits a footer. It could also be white or taupe (#bfb4ae).
2. **Button corners.** I chose a 3px radius, almost square. If the site's buttons are pill-shaped or fully square, change `--radius-sm` in `tokens.css`.
3. **Which elements use the uploaded condensed font.** I assumed the uppercase section titles.
4. **Hero.** The site has a photo with a light grey veil (#8d8b86 at 27%) behind dark text. The mock-up uses a sand placeholder until the photo is exported.
5. **Header colour and position.** I chose a white header that scrolls away with the page, with the menu in its own row on desktop.

## Questions for the owner
1. **Font licences.** The current site uses **Futura** (licensed through Wix, so it can't be used off Wix) and an uploaded font whose file name says **"FSP DEMO – Balgin ExtraLight SemiCondensed"**. A demo file is usually not licensed for a commercial website.
   - Do you own a web licence for Futura or for Balgin?
   - If yes, send the licence and the font files and we'll switch back in `fonts.ts` (a few lines).
   - If not, we keep the free look-alikes now in use: Jost for Futura, Antonio for the condensed headings. Lato is free either way.
2. **Logo on dark backgrounds.** Is there a version of the logo for dark backgrounds (light outlines)? Without one, the dark theme puts the logo on a cream plate.
3. **Dutch text.** The current site is English only. Should the Dutch version of the pages be written by you or a translator, or is my draft translation fine to start from?
4. **Footer credit.** Keep "Design by Sustainable Web Design" and "©2023" in the footer as they are?

## Notes for other agents
- Public pages: use `<SiteHeader>` and `<SiteFooter>` from `@/design-system`. Use `<Header>` only for internal tools that should not look like the website.
- Use `font-display` (Antonio, uppercase, `text-accent`) for big section titles, plain `h2`/`h3` for normal headings (Jost is applied automatically), and the body default (Lato Light) for text.
- New colour utilities: `bg-sand`, `bg-sage` + `text-on-sage` (large text only), `text-brown` (large text only), `bg-logo-plate`.
- `dark:` now only applies when `data-theme="dark"` is set.
- Menu labels are `design.site.nav.*`; URLs and contact details are in `src/design-system/site.ts`.
- The unused `design.ui.logoPlaceholder`, `design.ui.logoText` and `design.ui.theme.system` message keys are still there and can be removed later.
