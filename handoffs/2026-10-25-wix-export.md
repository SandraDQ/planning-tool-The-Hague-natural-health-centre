# Handoff: Wix site export (2026-10-25)

Branch `claude/project-thread-3cunpa`. Everything is under `wix-export/`; scripts in `scripts/wix-export/` (run order in `wix-export/README.md`).

**Goal changed:** the owner wants the current site copied faithfully (same look, logo, content, structure), with login and online booking added. This replaces the "redesign in the new style" part of master prompt 8/8A.

## What's there
- `brand/`: original logos (header hummingbird, footer, variants in `logos/`), favicons, `notes.md`, `tokens.json` (colours, buttons, spacing), `fonts/` (font files, `fonts.css`, typography per element).
- `screenshots/`: desktop (1440) and mobile full-page PNGs for 19 URLs.
- `layout/<page>/layout.md` + section shots; `layout/navigation.md` (header, footer, mobile menu).
- `pages/`: text per page as Markdown, `_site-chrome.md`, `events.json` (267 events).
- `sitemap/urls.csv`: all 309 public URLs for redirects.
- `media/manifest.json`: list of all 871 Media Manager files. **Owner decided (2026-10-27) not to keep the full library**; the 1.3 GB copy was deleted.
- **Images for the new site:** project files folder `wix-export/site-images/` (201 images, 35 MB): every photo shown on a non-event page, resized to max 2000px, JPEG or WebP; logos unchanged. `index.json` maps each file to its Wix id and pages. Copy the ones you use into the site (e.g. `public/images/`); rebuild with `python3 -I scripts/wix-export/site_images.py <out>`.
- `media-used.json`: which photos each page uses (201 on non-event pages).

## Watch out for
- Main menu links go to `/kopie-van-therapies` and `/kopie-van-conditions` (not in the sitemap). Also `/therapies`, `/booking`, `/privacy`. All exported under `pages/unlisted/`; all need redirects.
- Two "home" pages: `/` and `/copy-of-meditation-video`. **Owner confirmed (2026-10-25): `/` is the real home page.** Rebuild `/` as home, point the logo at `/`, and redirect `/copy-of-meditation-video` to `/`.
- Fonts (Futura, Avenir, Helvetica and the uploaded wordmark font): **owner confirmed (2026-10-25) she holds licences for them and they may be used.** Use the files in `brand/fonts/`.
- Wix serves phones a 320px layout, so mobile screenshots are 640px wide.
- 34 images shown on the site are not in the Media Manager (26 stock, 8 owner uploads); URLs in `media-used.json`.
- No client data: Google Reviews widget, comments and member areas are masked/excluded. Public therapist contact details are kept.

## Still open
- Revoke the read-only Wix API key once migration is done.
