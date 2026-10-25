# Brand assets

The centre's **original** logo files from the current website (Wix export, `wix-export/brand/`),
copied byte-for-byte. Do not redraw, recolour, crop, trace, filter, re-encode or "modernise" them.

| File | What | SHA-256 |
|---|---|---|
| `logo-header-cropped-as-shown.png` | Hummingbird as the site header shows it (Wix's own crop of the upload) | `6e373a6c988f9d6a7624f4a2092629b534adc080000a1e01af21b340e8a3696b` |
| `logo-header-original.png` | Hummingbird, original upload (kept for reference) | `f5275b3ef6e304a34abca9f1481b7a6f28325ca57e5396328e7b79d67c738f7b` |
| `logo-footer-original.png` | Full logo (bird, circle, lily, name), original upload, transparent | `795c58f74e16be35cc5c0b0f9b4079d389e7b4da366eb843558f7748e55fb247` |
| `favicon-original.png` | Favicon, original upload | `ab2b577500470e3fce688141dd67052c2383d5d2550d83ad0e736cca06dff313` |

They are wired up in `src/design-system/brand.ts` and shown by `<Logo variant="mark" | "full">`.
`src/app/favicon.ico` (16/32/48) and `src/app/apple-icon.png` (180) are resized from `favicon-original.png`;
`src/app/icon.png` is an exact copy of it.
