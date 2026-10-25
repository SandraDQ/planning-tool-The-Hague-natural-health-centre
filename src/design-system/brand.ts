/**
 * Brand assets.
 *
 * The original logo is NOT in the repo yet (it comes from the Wix export).
 * Never draw, recreate or approximate it. When the file arrives:
 *   1. put it, unchanged, at public/brand/logo.svg (or .png)
 *   2. set `logo` below to its path and its real pixel width/height
 * The <Logo> component then shows it everywhere; until then it shows a
 * neutral, clearly labelled placeholder.
 */
export type LogoAsset = { src: string; width: number; height: number };

export const brand: {
  logo: LogoAsset | null;
  /** Width / height of the placeholder slot. Provisional until the real logo's proportions are known. */
  placeholderAspectRatio: number;
} = {
  logo: null,
  placeholderAspectRatio: 3,
};
