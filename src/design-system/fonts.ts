import localFont from "next/font/local";

/*
 * Self-hosted, open-licence (SIL OFL 1.1) stand-ins for the fonts on the
 * current Wix site. Files are vendored from @fontsource 5.3.0 (latin subset)
 * into ./fonts, with their licences. Nothing is loaded from Google or Wix.
 *
 *   Site font                                   -> here
 *   lato-light (Wix-hosted Lato)                -> Lato 300 / 400 / 700   (same family, OFL)
 *   futura-lt-w01-light / -book (licensed via Wix) -> Jost 300 / 400 / 500 (open Futura-style geometric)
 *   orig_fsp_demo_blgnxtrlghtsmcndnsd (uploaded "FSP DEMO" file,
 *     read as Balgin ExtraLight SemiCondensed)  -> Antonio 100 / 200      (closest open condensed match)
 *
 * Licence question for the owner: see handoffs/phase2-design-system-v2.md.
 */

export const lato = localFont({
  src: [
    { path: "./fonts/lato-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/lato-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "./fonts/lato-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/lato-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-lato",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const jost = localFont({
  src: [
    { path: "./fonts/jost-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/jost-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jost-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jost",
  display: "swap",
  fallback: ["Futura", "Century Gothic", "Avenir Next", "sans-serif"],
});

export const antonio = localFont({
  src: [
    { path: "./fonts/antonio-latin-100-normal.woff2", weight: "100", style: "normal" },
    { path: "./fonts/antonio-latin-200-normal.woff2", weight: "200", style: "normal" },
  ],
  variable: "--font-antonio",
  display: "swap",
  preload: false,
  fallback: ["Arial Narrow", "sans-serif-condensed", "sans-serif"],
});

/** Put on <html> so the CSS variables exist everywhere. */
export const fontVariables = `${lato.variable} ${jost.variable} ${antonio.variable}`;
