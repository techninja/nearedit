# The NearEdit logo

The **E is a timeline**: its stem is the playhead — red, a little taller
than the letters, with a handle on top — and its three arms are clips of
different lengths, in the colours the editor gives a video clip, a still
and a sound. In the monogram the same playhead is the right stem of the N,
and holds the E's clips.

The SVG files in this folder are the source of truth. Everything else —
the PNG pictures, the `<app-logo>` component, the animated opening — is
made from them or checked against them.

## Files

| File | What | For |
| ---- | ---- | --- |
| `wordmark-on-dark.svg` | "NearEdit", white letters | Dark grounds |
| `wordmark-on-light.svg` | "NearEdit", ink letters | Light grounds |
| `wordmark-white.svg` | The wordmark in one colour, white | Dark grounds, where colour is not available |
| `wordmark-ink.svg` | The wordmark in one colour, ink | Light grounds, where colour is not available |
| `icon.svg` | The NE monogram on the navy tile | App icon, avatar — on any ground, 40 pixels and up |
| `icon-on-light.svg` | The monogram on a paper tile with a hairline edge | Where a dark tile is too heavy |
| `mark.svg` | The E alone, no ground | Small places beside text |
| `mark-tile.svg` | The E on the navy tile | 32 to 64 pixels |
| `favicon.svg` | The E on the tile, redrawn on a 32-pixel grid | 16 to 32 pixels: the browser tab |
| `png/favicon-32.png` | `favicon.svg` at 32 | Browsers that take no SVG icon |
| `png/apple-touch-icon.png` | The icon on a full navy square, 180 | iOS home screen (it rounds the corners itself) |
| `png/icon-192.png`, `png/icon-512.png` | `icon.svg` | Android home screen, a web manifest, stores |
| `png/wordmark-social.png` | The wordmark on navy, 1280 × 640 | Link previews |

Below about 40 pixels the monogram turns to mush: use the E alone. Below
32, use `favicon.svg`, whose stem, clips and gaps fall on whole pixels at
16 and at 32 (a 2-pixel stem, 2-pixel clips, 1-pixel gaps at 16); it is
drawn heavier than the mark for that reason and is not meant to be shown
large.

## Colours

Brand constants — the same in every theme of the app, never theme tokens.

| Name | Value | Where |
| ---- | ----- | ----- |
| Blue | `#3b82f6` | Top clip |
| Amber | `#f59e0b` | Middle clip |
| Green | `#10b981` | Bottom clip |
| Playhead red | `#ef4444` | The playhead |
| Navy | `#0f172a` | The tile; the ground of the opening |
| Ink | `#0f172a` | Letters on light grounds |
| Paper | `#f8fafc` | The light tile |
| White | `#ffffff` | Letters on dark grounds |

The hairline around the paper tile is `#e2e8f0`. On a light ground the
letters are ink, on a dark one white; the E keeps its four colours on
both. The one-colour versions are for a single ink only.

## Geometry

One unit system everywhere: **the cap height is 100**. Letters stand on
y = 100 and reach up to y = 0.

- **Clips**: 22 high, corners 6, at y = 0, 39 and 78 (gaps of 17). They
  start under the middle of the stem and end 64, 48 and 70 from its left
  edge.
- **Playhead**: a stem 14 wide from the handle down to y = 109, its foot
  round. The handle is 30 wide and 7 high with corners of 2, its top at
  y = −19, and runs into the stem over shoulders at 45°.
- **Wordmark**: 550 wide. "Near" starts at x = 0, the E's stem at
  x = 312, "dit" at x = 393. Its box (`0 −19 550 138`) leaves as much room
  under the letters as the playhead takes above them, so centring the
  file centres the word.
- **Monogram**: an N 73 wide — a stem of 21, a diagonal of 23 — whose
  right stem is the playhead at x = 59, with the E's clips on it. The
  tile is 224 with corners of 50; the monogram sits at (51, 64) on it.
- **Mark on its tile**: the tile is 176 with corners of 39.

## Sizes and clear space

- **Wordmark**: at least 20 pixels high (the file's box; about 80 wide).
  The one-colour versions: at least 24.
- **Icon** (monogram): at least 40 pixels. **Mark on its tile**: at least
  32. **Favicon**: 16 to 32.
- **Clear space**: keep half the cap height — half the height of the N —
  free on every side of the wordmark, and an eighth of the tile around an
  icon.

Do not recolour the clips, reorder them, stretch the drawing, set the
other letters in another typeface, or put the wordmark for dark grounds on
a light one.

## How the files were made

The letters are **outlines, not text**: no font is needed to show any of
these files.

1. "Near" and "dit" were set in Inter Bold 4.001 (SIL Open Font License;
   the file bundled at `src/vendor/fonts/inter/inter-latin-700-normal.woff2`)
   with a tracking of −0.035 em and the font's own kerning (HarfBuzz:
   e–a +20 font units).
2. Each glyph's outline was read with fontTools, overlapping contours were
   merged, and the quadratic curves were written as SVG path data scaled
   by 100 / 1490 (the font's cap height is 1490 of 2048 units per em),
   y downward, two decimals. This was done once, outside the repository;
   the result is the path data in the wordmark files.
3. The E, the monogram's N and the tiles are drawn by hand in whole
   numbers.
4. The PNG pictures are drawn from the SVG files by
   `node scripts/build-logo.js` (`@napi-rs/canvas`); run it after changing
   a drawing. It also writes the pictures of two examples:
   `examples/falling-logos/logo.png` and the logo files of the brand kit
   in `examples/kits/nearedit/`.

`logo.test.js` beside this file keeps the copies honest: the shapes of
the `<app-logo>` component must be those of the SVG files, the files may
use only the brand colours and no text, and every PNG must be what its
SVG draws.

## Where it is used

- **The app**: `<app-logo variant="wordmark | icon | mark">`
  (`src/components/atoms/app-logo/`), inline SVG whose letters take the
  text colour of the theme. With `animated` it builds itself once: the
  playhead arrives, the clips slide out of it, the letters settle.
- **Video**: `examples/logo-sting/` — an opening and a logo wipe drawn by
  NearEdit's own compositor from shapes, text and keyframes.
- **Brand kit**: `examples/kits/nearedit/` — NearEdit's colours and logo
  as a kit anyone can choose.
