# Phase 2 · Design system: handoff

*design-system agent · 25 Oct 2026 · status: ready for owner review (gate: approve components + 3 mock-ups)*

## What was built

### Tokens: `src/design-system/tokens.css`
Imported from `src/app/globals.css` and exposed to Tailwind v4 through `@theme inline`. The default Tailwind colour palette, type sizes, radii and shadows are **removed on purpose**, so screens can only use these tokens.

| Group | Tokens (Tailwind names) |
|---|---|
| Colour | `canvas` (warm neutral page), `surface`, `surface-2`, `border`, `border-strong`, `fg`, `fg-muted`, `accent`, `accent-strong`, `accent-soft`, `on-accent`, `success(-soft)`, `warning(-soft)`, `danger(-soft)`, `focus`, `scrim`, `header` |
| Type | System font stack (SF / Segoe / Inter if installed / Roboto). No web font, no network. **Five sizes:** `text-sm` 14, `text-base` 17, `text-lg` 20, `text-xl` 28, `text-2xl` 36–52 (hero only) |
| Spacing | Tailwind 4px grid, `px-gutter` (20px on phones, 32px from 768px), `max-w-content` 72rem, `max-w-reading` 40rem |
| Radius | `rounded-sm` 12, `rounded-md` 16, `rounded-lg` 20, `rounded-xs` 6 (checkbox squares and nested segments only), `rounded-full` for pills |
| Shadow | `shadow-sm`, `shadow-md`, `shadow-lg` (deeper in dark mode) |
| Motion | 150–250 ms, one easing (`ease-calm`); `animate-sheet-up`, `animate-fade-in`, `animate-toast-in`; everything switched off under `prefers-reduced-motion` |
| Themes | Light + dark. Follows the device; `<html data-theme="light|dark">` overrides. The `dark:` variant respects both. |

Contrast checked (WCAG 2.1 AA): body text 15.9:1 (light) / 15.6:1 (dark), muted text ≥ 5.7:1 on every surface, white on accent 6.3:1, input outlines ≥ 3.4:1.

### Components: `src/design-system/components/`, exported from `src/design-system/index.ts`
Button (`primary`/`secondary`/`ghost`, `md` 44px / `lg` 52px) · ButtonLink · IconButton (44×44) · TextField · Textarea · Select (native, so phones use their own picker) · Checkbox · RadioCard + RadioCardGroup · Card · Sheet (bottom sheet on phones, dialog from 640px; native `<dialog>` so focus trap and Esc work) · Toast + ToastProvider + `useToast()` (polite live region) · EmptyState · ProgressSteps ("Step 3 of 5" bar on phones, named steps wider) · DatePicker (week strip, arrow keys, unavailable days visible but disabled) · TimeSlotPicker (morning/afternoon/evening, empty state built in) · LanguageSwitch (next-intl, stays on the same page) · Header (frosted sticky, logo, nav, language switch; phone nav opens in a Sheet) · Badge · **extras:** Avatar (initials until photos exist), SegmentedControl, ThemeToggle, Logo, a small icon set (generic UI glyphs only).

Component strings (Close, Step x of y, Morning…) live in `messages/*.json` → `design.ui`. All other new strings are under `design.*`; existing keys untouched.

### Pages
| URL | What |
|---|---|
| `/nl/design` · `/en/design` | Component library with light / dark / auto toggle |
| `/…/design/home` | Home page mock-up: calm hero, one "Book" button, therapies, therapists, how booking works, visit |
| `/…/design/choose-time` | Booking step 3 of 5 "Choose a time": progress, week strip, slots, summary with duration, price €85, deposit €25 now, "balance payable at the session", 15-minute hold note |
| `/…/design/therapist-calendar` | Phone-first therapist calendar: day view with room blocks (room label on a tab), appointments (first name + service only), "being held" state, free gaps with "room for 1 more session"; week view (list on phones, 7-column grid wider); "Add booking" sheet |
| `/nl` · `/en` | Placeholder home now links to the design pages (real site in Phase 8) |

Design pages are `noindex`. All data is made up and labelled as such in each page footer.

## How to test
```
pnpm typecheck && pnpm lint && pnpm build   # all pass
pnpm start   # open /nl/design and /en/design
```
Try: keyboard only (Tab, arrows in the week strip, Esc closes sheets), the theme toggle, a phone-width window, `prefers-reduced-motion`.

## Screenshots: `/mnt/project-files/thnhc-plan/mockups/`
46 PNGs. For each of `home`, `choose-time`, `therapist-calendar`, `showcase` (NL) and `en-home`, `en-choose-time`, `en-therapist-calendar`:
`<page>-mobile-light.png`, `-mobile-dark.png` (full page, 390 wide @2x), `-mobile-light-screen.png`, `-mobile-dark-screen.png` (what you see on the first screen), `-desktop-light.png`, `-desktop-dark.png` (1280 wide).
Plus `therapist-calendar-week-{mobile,desktop}-light.png` and `therapist-calendar-add-sheet-{mobile,desktop}-light.png`.

## Provisional choices (to replace)
1. **Logo:** not in the repo. `<Logo>` shows a dashed box labelled "Logo" (3:1 slot). Nothing was drawn or imitated. To switch: put the original file in `public/brand/` and set `brand.logo` in `src/design-system/brand.ts` (see `public/brand/README.md`). I used a config entry rather than auto-detecting the file, because `public/` is not reliably readable from server functions on Vercel.
2. **Accent colour:** muted sage `#4A6652` (dark mode `#9DBBA5`), marked PROVISIONAL in `tokens.css`. Must be replaced by a colour taken from the logo; only the `--thn-accent*` / `--thn-on-accent` values change. Re-check contrast after.
3. **Photos:** neutral "photo to follow" boxes and initials avatars. Real photos come from the Wix export.

## Notes for other agents
- Use only `@/design-system` components and the token utilities. Raw colours like `bg-white` or `text-gray-500` no longer exist.
- `cn()` only joins class names; it does **not** resolve Tailwind conflicts. To hide a component at some sizes, wrap it (`<div className="hidden lg:block"><Button/></div>`) instead of passing `hidden` to it.
- Import `dayToDate` and `themeInitScript` from `@/design-system`. They live in plain modules, so server components can use them.
- Fixed bottom action bars on phones are `sticky bottom-0` after `<main>`, so they never cover the footer.
- `tsconfig.tsbuildinfo` (tracked in git) changed because `pnpm typecheck` ran. It probably belongs in `.gitignore`; that is the orchestrator's call.

## Open questions for the owner
1. **Logo and brand colours:** please supply the original logo file (SVG if possible) and any brand colours. The accent will be rebuilt around it. Is there a version for dark backgrounds?
2. **Typeface:** the system font keeps pages fast and private (nothing loaded from Google). Does the current site use a specific brand font we must keep?
3. **Buttons:** 12px rounded rectangles (within the 12–20px rule). Do you prefer fully rounded "pill" buttons?
4. **Calendar:** in the day view the room name sits on a small tab above each block. If two blocks follow each other with no gap (e.g. 08–12 and 12–16), the tab of the second overlaps the end of the first. Is that a real case for one therapist? If yes, I'll put the label inside the block.
5. **Home page nav labels** (Therapies, Therapists, About us, Contact) are placeholders until the Wix sitemap is in.
