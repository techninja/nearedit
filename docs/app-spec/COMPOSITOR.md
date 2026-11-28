# Compositor — Generators, Effects, Keyframes

One frame compositor draws every NearEdit picture. The browser preview runs
it on an HTML canvas; the server runs **the same modules** on a server-side
canvas (`@napi-rs/canvas`, the same Skia rasteriser Chromium uses) and pipes
the frames to FFmpeg for encoding. Generators, effects, text and particles
are therefore written once, and what you preview is what renders.

`tests/compose/parity.test.js` draws a set of reference documents — every
generator, text in many styles and mid-animation, effects, blend modes,
track surfaces — on the server canvas and in real Chromium and requires
them to match. On Linux they are bit-identical, text and colour emoji
included.

```text
EDL ──► resolveClip (keyframes) ──► layers ──► drawFrame(ctx, …) ──► canvas
                                                   │
        browser: <canvas> preview        server: frames ──► FFmpeg encode
```

The FFmpeg filter-graph renderer ([RENDER.md](./RENDER.md)) remains the fast
path for stretches of plain footage; the canvas path renders everything else.

## Document additions (EDL v3)

All optional; a v2 document is a valid v3 document.

### Clip

| Field | Type | Notes |
| ----- | ---- | ----- |
| `generator` | `{ type, seed, params }` | A synthetic source. `type` empty = not a generator. `clipKind` is `generator` |
| `effects` | `[{ effectId, type, enabled, params }]` | Applied in order after the clip is placed |
| `keyframes` | `{ "<path>": [{ t, v, ease }] }` | Animates any numeric or colour property |
| `blendMode` | enum | How the clip combines with what is under it. Default `normal` |
| `fadeInCurve`, `fadeOutCurve` | enum | Shape of the fades: `linear` (default), `smooth`, `fast`, `slow`, `sharp` |
| `text` | object | Title text, extended below |

Generator, title, image and placeholder clips now keep a source window like
media does: `timelineEnd - timelineStart === sourceOut - sourceIn` for every
clip. Their source is unbounded, so `sourceIn` may be negative. Trimming a
clip's start moves `sourceIn`; that is what keeps keyframes and generator
motion attached to the content through trims, slips and splits.

### Track

| Field | Type | Notes |
| ----- | ---- | ----- |
| `opacity` | number | 0..1, video tracks |
| `blendMode` | enum | How the whole track combines with the tracks under it |
| `effects` | effect[] | Applied to the track's composite |

### Document

| Field | Type | Notes |
| ----- | ---- | ----- |
| `version` | 3 | |
| `background` | colour | Behind everything. Default `#000000` |

### text (additions)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `fontFamily` | string | A bundled family (`Inter`, `Playfair Display`, `JetBrains Mono`, `Bebas Neue`, `Caveat`) or a generic name |
| `weight` | number | 0 = from `bold` (700) / regular (400) |
| `lineHeight` | number | Multiple of `fontSize`. Default 1.2 |
| `letterSpacing` | number | Pixels at output resolution |
| `maxWidth` | number | Wrap width in output pixels; 0 = no wrapping |
| `boxPadding`, `boxRadius` | number | Background box, as multiples of `fontSize` / pixels |
| `shadowColor`, `shadowBlur`, `shadowX`, `shadowY` | | Drop shadow |
| `animateIn`, `animateOut` | `{ type, duration, by, stagger, ease }` | `type`: none, fade, slide-up/down/left/right, scale, blur, typewriter. `by`: block, line, word, char |

### Blend modes

`normal`, `add`, `screen`, `multiply`, `overlay`, `darken`, `lighten`,
`difference`, `soft-light`. They map onto canvas `globalCompositeOperation`
(`add` is `lighter`).

## Keyframes

```json
"keyframes": {
  "transform.x": [{ "t": 0, "v": -400, "ease": "ease-out" }, { "t": 1.2, "v": 0 }],
  "effects.fx_1.radius": [{ "t": 0, "v": 30 }, { "t": 0.8, "v": 0 }],
  "generator.params.angle": [{ "t": 0, "v": 0 }, { "t": 10, "v": 360 }],
  "text.color": [{ "t": 0, "v": "#ffffff" }, { "t": 2, "v": "#f97316" }]
}
```

- A **path** is dotted access into the clip. `effects.<effectId>.<param>`
  addresses one effect's parameter.
- **`t`** is seconds in clip-local source time: `sourceIn + (time -
  timelineStart)`. Keys are sorted by `t`.
- **`v`** is a number or a hex colour (`#rrggbb` / `#rrggbbaa`).
- **`ease`** shapes the segment leaving its key: `linear` (default), `hold`,
  `ease-in`, `ease-out`, `ease-in-out`, `back-in`, `back-out`,
  `elastic-out`, `bounce-out`, `sine`.
- Before the first key a property holds the first value; after the last, the
  last. A keyframed property overrides ken burns for that property.

`src/utils/edl/animate.js` `resolveClip(clip, time)` returns the clip with
every keyframed property replaced by its value at that moment. Everything
downstream sees plain values.

`volume` is a property like any other, so a keyframed `volume` is a volume
envelope. Fade curves and envelopes shape picture opacity and audio gain
through `src/utils/edl/levels.js`, which preview and render share.

## Time and size

A generator or effect is a pure function of the document and the time. It
receives:

| Name | Meaning |
| ---- | ------- |
| `time.t` | Clip-local source time, seconds — the keyframe time base |
| `time.age` | Seconds since the clip's start on the timeline |
| `time.remaining` | Seconds until the clip's end |
| `time.duration` | Clip length |
| `time.frame` | Output frame number of this moment |
| `frame.width`, `frame.height` | Size of the canvas being drawn, pixels |
| `frame.scale` | Canvas pixels per output pixel (`frame.width / outputWidth`) |
| `frame.outWidth`, `frame.outHeight` | Output resolution, pixels |
| `frame.fps` | Output frame rate |

**Every length in the document is in output pixels.** Code multiplies by
`frame.scale` before drawing, so a 640-pixel preview and a 1920-pixel render
show the same picture. A blur radius, a font size, a particle speed — all of
them scale.

**Determinism.** No `Math.random`, no clocks, no state carried from one frame
to the next. Randomness comes from `src/utils/compose/random.js`, seeded by
`generator.seed` and stable per particle or per cell. Any frame can be drawn
on its own, in any order — that is what makes scrubbing, segment rendering
and preview/render agreement work.

## Layer pipeline

For each frame, back to front:

1. Fill the canvas with `background`.
2. For each visible video track (last first; `activeTracks` decides):
   1. For each clip covering the time, in start order, `resolveClip` it, then
      draw its **source**: a footage frame or still placed with `placeSource`
      and `resolveTransform`; a generator or title drawn frame-sized, then
      transformed the same way.
   2. If the clip has enabled effects or a non-normal blend mode, it is drawn
      onto its own frame-sized surface first, its effects are applied in
      order, and the surface is composited with the clip's opacity
      (`transform.opacity × videoOpacity`) and `blendMode`. Otherwise it is
      drawn straight through.
   3. If the track has effects, opacity below 1 or a non-normal blend mode,
      its clips are composed on a track surface, the track effects applied,
      and the surface composited with the track's opacity and `blendMode`.

Effects therefore act in frame space, after the transform: a 20-pixel blur
is 20 output pixels however the clip is scaled, and glows and shadows can
spill outside the clip's rectangle.

## Module contracts

Generators and effects live in `src/utils/compose/generators/` and
`src/utils/compose/effects/`, one module each plus one line in that folder's
`index.js`. The catalog (`catalog()` in `src/utils/compose/index.js`), which
the UI, the director and the docs read, picks them up from there.
`src/utils/compose/README.md` walks through adding one.

```js
/** A generator. */
export default {
  type: 'gradient',
  label: 'Gradient',
  category: 'background', // background | shape | text | particles | pattern
  description: 'Linear or radial colour gradient',
  params: {
    angle: { type: 'number', default: 90, min: 0, max: 360, unit: '°', animatable: true },
    from: { type: 'color', default: '#1e1b4b', animatable: true },
  },
  draw(ctx, params, time, frame, env) {}, // paints the whole frame-sized canvas
};

/** An effect: either a CSS-style filter string, or a drawing pass. */
export default {
  type: 'dropShadow',
  label: 'Drop shadow',
  category: 'light', // color | blur | stylize | light | key | distort
  params: { blur: { type: 'number', default: 8, min: 0, max: 200, unit: 'px', animatable: true } },
  filter: (params, frame) => `drop-shadow(12px 12px ${params.blur * frame.scale}px #000)`,
  // How far the filter samples, so the frame's edge pixels can be extended
  // outward and a filter at the frame's edge does not darken the border:
  reach: (params, frame) => params.blur * frame.scale * 3,
  // …or, for effects that need more than a filter (most of them):
  // apply(surface, params, time, frame, env) {}  — redraws surface.canvas in place
};
```

`generator.seed` reaches a generator as `params.seed`. A schema entry may
carry a `label`, a `when: { otherParam: [values] }` hint that tells an
editor when to show it, and a `group` naming the section a long list shows
it under. A module that throws is skipped with one warning;
the rest of the frame is still drawn.

Parameter types: `number` (`min`, `max`, `step`, `unit`), `color`, `boolean`,
`select` (`options`), `text`, `image` (a media path), `point` (`{ x, y }` as
fractions of the frame). `animatable: true` marks what may be keyframed.
Missing parameters take their defaults, so a document stores only what was
changed.

### The host environment `env`

The only door to the outside. Compositor modules never touch `document`,
`window`, `OffscreenCanvas`, `fetch` or the file system.

| Member | Purpose |
| ------ | ------- |
| `createCanvas(width, height)` | A canvas with a 2D context |
| `scratch(width?, height?)` | A pooled, cleared surface, taken back when the module returns |
| `image(path)` | A decoded still or sprite for a media path, or `null` while it loads |
| `frameOf(clip, sourceTime)` | The footage frame for a clip, or `null` when not available |
| `fontReady(font, text)` | Whether the font is loaded (the browser loads on demand) |

`requirements(edl)` lists the images and fonts a document needs, so a host
can load them before drawing: the server loads all of them first; the
browser draws what is ready and redraws when the rest arrives.

### Canvas features

Use what both canvases implement identically: paths, `roundRect`, linear and
radial gradients, `drawImage` with transforms, `globalAlpha`,
`globalCompositeOperation`, shadows, `filter` with CSS filter functions,
text with `font` / `measureText`, `getImageData` / `putImageData`. Pixel
loops are allowed but slow — keep them off the full frame where a filter or
a composite operation can do the job.

## Starting catalog

**Generators:** `solid`, `gradient`, `noise`, `shape` (rectangle, ellipse,
polygon, star, line), `pattern` (stripes, checker, dots, grid), `particles`,
and titles through `clip.text`.

**Particles** are stateless: particle *n* is born at a time fixed by the
rate and seed, and its position, size, colour and opacity are closed-form
functions of its age. Parameters cover the emitter (point, line, box,
circle, ring, edge), flow (rate, bursts, lifetime, speed, direction, spread,
gravity, drag, swirl, turbulence), look (size and its change over life,
spin, tumble, colour over life, opacity with fade in / out, blend) and the
**sprite**: a built-in shape (dot, circle, square, star, spark, ring,
snowflake, heart, confetti) or any image from the project
(`sprite: "image"`, `image: "/abs/path.png"`). Thirteen presets — snow,
rain, sparks, confetti, falling images and more — come with it. Full
reference: [PARTICLES.md](./PARTICLES.md).

A generator module may export **presets** (`{ id, name, description,
params, blendMode? }`); the catalog lists them with the generator.

**Effects:** nineteen, on clips and on tracks — colour (`colorAdjust`,
`colorBalance`, `levels`, `tint`, `stylize`, `posterize`), blur and light
(`blur`, `glow`, `dropShadow`, `vignette`, `flicker`), texture (`grain`,
`scanlines`, `pixelate`, `rgbSplit`, `mirror`) and keying (`chromaKey`,
`mask`, `wipe` — a soft-edged reveal for transitions) — plus ten looks
built from them (`EFFECT_PRESETS`). Parameters, order, alpha handling and
cost: [EFFECTS.md](./EFFECTS.md).

## Text animation

`animateIn` plays from the clip's start and `animateOut` ends at its end,
whatever the clip's source window. With `by` set to `line`, `word` or
`char`, piece *i* starts `i × stagger` after the first and takes `duration`.
Slides travel one font size and fade; `blur` starts at a quarter of the font
size; `typewriter` reveals one piece at a time and erases from the end. With
`by: block` the background box moves with the text; otherwise it stays put.

## Fonts

Five families and colour emoji are bundled (`src/utils/compose/fonts.js`),
vendored from `@fontsource` packages into `src/vendor/fonts/` at install.
The browser loads them through `fonts.css`; the server registers the same
files with their weight and style. A document that names another family gets
the sans-serif default, and `fontString` only ever names a face that is
bundled, so neither side synthesises one.

## Rendering on the server

`src/api/render/canvas/` drives the compositor headlessly
([RENDER.md](./RENDER.md#the-canvas-path)): one FFmpeg per footage clip on
screen decodes exactly the frames the output shows, as raw RGBA at the size
the clip is shown at; a host environment hands each to `frameOf`; `drawFrame`
draws the document — its clips snapped to the frame grid — at `frame / fps`;
and the canvas pixels are piped into an FFmpeg encoder with the settings the
filter-graph path uses, so segments from either path join without
re-encoding.

- **Routing.** A segment takes the canvas path when anything in it needs the
  compositor — a generator, a title, an enabled effect, a blend mode,
  keyframes on a visual property, a curved fade, track opacity below 1, a
  non-black background — and the filter-graph path otherwise.
  `POST /render/plan` says which, and why. `RENDER_ENGINE` (`auto`, `canvas`,
  `ffmpeg`) overrides the choice; `ffmpeg` refuses a timeline that needs the
  compositor instead of drawing it wrong.
- **Workers.** Drawing happens in worker processes, one environment (and
  scratch pool) each, `RENDER_WORKERS` at a time, never on the server's
  event loop. Long canvas stretches are cut into 4 s chunks for them.
- **What you preview is what renders.** `canvas/compare.test.js` renders
  documents — generators, an animated title over footage, effects, blend
  modes, a keyframed transform, a cross-fade, track opacity — decodes the
  video and compares it with `renderFrame` of the same document and time:
  identical in every byte when encoded without loss; through H.264 the mean
  luma error stays under 3 of 255 (`standard`) and every frame is at least
  1.4 times closer to its own picture than to a neighbouring frame's.
- **Sound** is mixed by FFmpeg and follows `levels.js`: fade curves as the
  matching `afade` curves, a keyframed `volume` as a sampled envelope.

Footage and stills larger than they are shown are reduced by FFmpeg before
they reach the canvas (the preview reduces them on the canvas), and where a
title appears over a running shot the footage changes renderer for that
stretch; both are described under
[Limits](./RENDER.md#limits-and-what-is-not-honoured).

## Authoring without the UI

`bin/nearedit.js` is the editor without the editor: a document, a text
editor and a few commands are enough to build an edit — from generators
alone, or with footage, web clips and music. It runs the server's own renderer in-process; no
server needs to be running, and it works from any directory.

```bash
nearedit validate edit.json                    # what is wrong, and where
nearedit catalog                               # generators, effects, blend modes, easings, fonts
nearedit frame  edit.json --time 3.5           # one frame as PNG → edit-3.5s.png
nearedit render edit.json --preset draft       # the whole edit → edit.mp4
```

| Command | Does | Output |
| ------- | ---- | ------ |
| `render <edl.json> [-o out.mp4] [--preset draft\|standard\|high] [--range start:end] [--workers n]` | Encodes the document with the passes of the render job | Progress on stderr, the file's path on stdout |
| `frame <edl.json> --time <seconds> [-o frame.png] [--width n]` | Draws the frame the render shows at that moment, footage included | The PNG's path on stdout |
| `validate <edl.json> [--json]` | Normalises and checks the document | One line per problem with its path (`tracks[0].clips[2].generator.type: unknown generator …`); exit 1 when it cannot be rendered |
| `catalog [--json]` | Lists generators and effects with every parameter (type, range, default), effect presets, blend modes, easings, text animations, fonts — read from `catalog()` | Text, or one JSON object |
| `record <recipe.json> [-o out.mp4] [--allow host]` | Records a [web clip](./WEBCLIP.md) recipe in the headless browser | The recording's path; its track beside it |
| `music <song.json> [-o out.wav]` | Renders a [song](./MUSIC.md) with the synth engine | The WAV's path |
| `help [command]` | Explains | |

`render` and `frame` first make whatever a document's web clips and music
clips still lack: recordings need the browser, music needs nothing.

- **A document** is one JSON file in the [EDL](./EDL.md) shape. Only what
  differs from the defaults has to be written: `fps`, `resolution`,
  `tracks`, and per clip its times and its `generator`, `text` or
  `sourceFile`.
- **Media paths** are relative to the document's folder (a bare name is also
  looked up in the `--media` folders). Only files under that folder and
  under any `--media <dir>` are read — symbolic links are followed first —
  and that includes sprite and mask images named in parameters.
- **`validate`** reports errors (a missing or forbidden file, an unknown
  generator or effect, a clip that could not be read at all — one without
  `timelineStart`, say — a broken invariant, an empty timeline) and warnings
  (a value that was repaired on the way in — `"glow" was read as "normal"` —
  an unknown field or parameter, a clip longer than its file). With `--json`
  it also lists the segments and the renderer each will take.
- **Exit codes:** 0 done, 1 the document or the render failed, 2 the command
  line was not understood (the message says what was expected), 130
  interrupted. An interrupted render leaves no file behind.

```json
{ "fps": 30, "resolution": "1280x720", "tracks": [
  { "type": "video", "clips": [ { "timelineStart": 0, "timelineEnd": 4,
    "text": { "content": "Hello", "fontSize": 120,
              "animateIn": { "type": "slide-up", "by": "char" } } } ] },
  { "type": "video", "clips": [ { "timelineStart": 0, "timelineEnd": 4,
    "generator": { "type": "gradient", "params": { "angle": 120 } },
    "keyframes": { "generator.params.angle": [ { "t": 0, "v": 60 }, { "t": 4, "v": 200 } ] } } ] } ] }
```

The operations in `#utils/edl/index.js` (`insertGenerator`, `insertTitle`,
`addEffect`, `setKeyframe`…) build the same documents from code.
