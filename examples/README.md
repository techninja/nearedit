# Examples

Timelines written without the editor. Each one is an ordinary NearEdit
document: open it in the editor, or draw and render it from a shell with
`bin/nearedit.js`.

## Made from nothing

A 25 second piece with **no footage and no images** — every pixel is
drawn by a generator (gradient, pattern, noise, shape, particles) or is
text, moved by keyframes and finished with effects.

| Scene     | Seconds | What it shows                                                                                                                             |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Opening   | 0–5     | Radial gradient with a keyframed centre, dust particles, a title arriving letter by letter with a keyframed glow                          |
| Shapes    | 5–10    | Ellipse, star and polygon popping in (`back-out`), turning and changing colour, over a drifting dot pattern revealed by a radial wipe     |
| Particles | 10–15   | Fireflies, a fountain of sparks and a confetti burst over slow noise                                                                      |
| Effects   | 15–20   | A gradient resolving out of a mosaic, a masked stripe overlay in `overlay` blend, a title with keyframed colour fringes, a clock wipe out |
| End card  | 20–25   | Star field, the name, a line drawn by a keyframe                                                                                          |

```bash
node examples/made-from-nothing/build.js
```

```bash
node bin/nearedit.js validate examples/made-from-nothing/made-from-nothing.json
```

```bash
node bin/nearedit.js frame examples/made-from-nothing/made-from-nothing.json --time 12 -o frame.png
```

```bash
node bin/nearedit.js render examples/made-from-nothing/made-from-nothing.json -o made-from-nothing.mp4
```

How it is written:

- `made-from-nothing.json` — the document itself. `build.js` writes it;
  the test beside it fails when the two drift apart.
- `piece.js` — the tracks and the order of the scenes.
- `scenes/*.js` — one file per scene. Read these first.
- `kit.js` — five small helpers (`generator`, `particles`, `title`,
  `effect`, `keys`) over the document operations in `src/utils/edl/`:
  `insertGenerator`, `insertTitle`, `addEffect`, `setKeyframe`,
  `updateClip`. Nothing here is special to the example — the editor's
  buttons call the same functions.

To make your own, copy the folder, change the scenes and run `build.js`;
or skip the script and write the JSON by hand — `nearedit validate`
explains what is wrong with a document, and `nearedit catalog` lists every
generator, effect, preset, font and easing with its parameters.

## Falling logos

Six seconds written **by hand** as JSON: a particle generator that throws
an image (`"sprite": "image", "image": "logo.png"`, a path relative to the
document — NearEdit's icon), a title animated in word by word, and a
gradient with a keyframed angle. `falling-logos.json` is 80 lines;
everything it leaves out takes its default.

```bash
node bin/nearedit.js render examples/falling-logos/falling-logos.json -o falling-logos.mp4
```

## Logo sting

NearEdit's own logo, animated by NearEdit: **shapes, text and keyframes,
no picture**. Two pieces, each for a wide and for a tall frame.

| Document | Seconds | What it shows |
| -------- | ------- | ------------- |
| `opening.json`, `opening-tall.json` | 3.6 | On the navy ground the playhead comes in from the left and stops; the E's three clips slide out from behind it (a `mask` keeps what is right of the playhead, `back-out` lets each pass its place a little); the other letters settle, nearest the E first — one title per letter, keyed in `transform.y` and `transform.opacity`. Then it holds |
| `wipe.json`, `wipe-tall.json` | 1.2 | A logo wipe: the three clips shoot in and cover the frame, the playhead comes through and carries them off. The frame is covered from frame 14 to 18; the cut between the two scenes lies at frame 16, where nobody sees it |

```bash
node examples/logo-sting/build.js
```

```bash
node bin/nearedit.js render examples/logo-sting/opening.json -o opening.mp4
```

```bash
node bin/nearedit.js render examples/logo-sting/wipe.json -o wipe.mp4
```

How it is written:

- `logo.js` — the logo as numbers (units: the cap height is 100), the same
  drawing as `src/logo/*.svg`. The test beside it draws the opening's last
  frame and the wordmark's SVG file and requires them to agree.
- `opening.js`, `wipe.js` — the two timelines. Every clip lasts the whole
  piece and sits on a track of its own, so a key's time is simply the time
  on the timeline.
- `sheet.js`, `print.js` — a drawing space from logo units to pixels,
  rectangles, keys; and a printer that writes the documents compactly.
  The documents hold only what differs from the defaults.

To use the wipe over a cut of your own, delete its tracks "Scenes" and
"Scene names" and lay the other four over your cut, 16 frames before it.

What the shape generator could not draw directly, and how it is done
instead: the playhead's handle has no free outline, so it is put together
from a rounded bar, a square bar and a triangle (a three-sided `polygon`
turned upside down) over the stem; and a clip cannot be clipped by
another clip, so the E's clips come out from behind the playhead through
a `mask` effect that stands still in the frame. The letters are text in
the bundled Inter Bold — the logo files hold the same letters as outlines.

## NearEdit's own brand kit

`kits/nearedit/` is a [brand kit](../docs/app-spec/BRAND.md) as a folder:
a `kit.json` that extends the built-in `clean` kit with NearEdit's
colours, and beside it the logo as pictures (`mark.png`, the monogram on
its tile; `logo.png`, the wordmark for dark grounds — both drawn from
`src/logo/` by `scripts/build-logo.js`).

```bash
node bin/nearedit.js kit examples/kits/nearedit
```

```bash
node bin/nearedit.js restyle timeline.json --kit examples/kits/nearedit
```

To choose it in the editor, copy the folder into the server's kit library
(`data/kits/nearedit/`); it is then listed in the Brand dialog, and
**Update elements to brand** restyles a timeline with it.

Reference: [the document](../docs/app-spec/EDL.md),
[the compositor](../docs/app-spec/COMPOSITOR.md),
[particles](../docs/app-spec/PARTICLES.md),
[effects](../docs/app-spec/EFFECTS.md).
