/**
 * Brand assets: the centre's ORIGINAL logo files from the current website
 * (Wix export, wix-export/brand/), copied byte-for-byte into public/brand/
 * (SHA-256 checked, see handoffs/phase2-design-system-v2.md).
 *
 * Never redraw, recolour, re-crop, filter or re-encode these files.
 *
 * - `mark`: the hummingbird as the site's header shows it. This is the file
 *   Wix serves for the header (its own crop of the upload), used unchanged.
 * - `full`: the footer logo (hummingbird, circle, lily, "NATURAL HEALTH
 *   CENTRE / THE HAGUE"). The upload has a wide transparent margin; the site
 *   frames it with a display crop. `frame` repeats that exact frame in CSS
 *   (the file itself is untouched), so it looks the same size as on the site.
 */
export type LogoAsset = {
  src: string;
  width: number;
  height: number;
  /** Alt text used on the current site. */
  alt: string;
  /** Optional display frame (in the file's own pixels), as the site shows it. */
  frame?: { x: number; y: number; width: number; height: number };
};

export const brand: {
  mark: LogoAsset;
  full: LogoAsset;
  /** Original favicon upload (src/app/favicon.ico, icon.png and apple-icon.png are made from it). */
  favicon: LogoAsset;
} = {
  mark: {
    src: "/brand/logo-header-cropped-as-shown.png",
    width: 891,
    height: 1077,
    alt: "Natural Health Centre Hummingbird Logo",
  },
  full: {
    src: "/brand/logo-footer-original.png",
    width: 1563,
    height: 1563,
    alt: "Logo Natural Health Centre The Hague",
    // Wix footer crop: x_73,y_182,w_1409,h_1172 (only transparent margin is outside it)
    frame: { x: 73, y: 182, width: 1409, height: 1172 },
  },
  favicon: {
    src: "/brand/favicon-original.png",
    width: 493,
    height: 493,
    alt: "",
  },
};
