# Brand assets

This folder holds the centre's **original** logo, exactly as delivered (from the Wix export or the owner).

- Do not redraw, recolour, crop, trace or "modernise" the logo (MASTER_PROMPT 8 and 8A).
- Preferred: `logo.svg` (vector). Otherwise a high-resolution `logo.png`.
- If there are light/dark variants from the original designer, add them as `logo.svg` and `logo-dark.svg`.

After adding the file, set `brand.logo` in `src/design-system/brand.ts` to its path and real width/height.
The `<Logo>` component then shows it everywhere; until then it shows a labelled placeholder.

Then replace the **provisional** sage accent in `src/design-system/tokens.css` with a colour taken from the logo, and re-check contrast.
