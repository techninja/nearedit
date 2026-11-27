# EDL v3 — Timeline Document Schema

The EDL (Edit Decision List) is the single source of truth for an
adaptation's timeline. Everything — the canvas timeline, the shared frame
compositor ([COMPOSITOR.md](./COMPOSITOR.md)), the AI director and the
renderers — reads and writes this one JSON shape. Raw media is never
modified.

- Shape + defaults in code: `src/utils/edl/factory.js`, `src/utils/edl/defaults.js`
- In the browser: a plain object held by the edit session
  (`src/utils/editor/session.js`, read with `getDoc()`). The store carries
  only a change signal (`src/store/TimelineState.js`), so no store model
  declares the fields — a new field goes into the factories, the normaliser
  (which drops keys it does not know) and this document
- Pure operations: `src/utils/edl/*.js` (isomorphic, Node-tested), see
  [EDL-OPERATIONS.md](./EDL-OPERATIONS.md)

## Document

```json
{
  "version": 3,
  "fps": 30,
  "resolution": "1920x1080",
  "background": "#000000",
  "tracks": [],
  "markers": [{ "markerId": "m_1", "time": 12.5, "label": "Chorus", "color": "" }],
  "regions": [{ "regionId": "r_1", "start": 30, "end": 45, "label": "Verse", "color": "" }],
  "playheadPosition": 0,
  "cursorPosition": 0,
  "zoom": 1,
  "scrollX": 0
}
```

| Field      | Type     | Notes                                                    |
| ---------- | -------- | -------------------------------------------------------- |
| version    | 3        | Older documents are migrated on load, see [Versions](#versions-loading-and-saving) |
| fps        | number   | Output frame rate                                        |
| resolution | string   | Output frame size, `WxH`                                 |
| background | colour   | `#rrggbb`, drawn behind everything. Default `#000000`    |
| tracks     | Track[]  | Video tracks first, then audio                           |
| markers    | Marker[] | Sorted by `time`                                         |
| regions    | Region[] | Named time spans, sorted by `start` (`src/utils/edl/regions.js`) |

`playheadPosition`, `cursorPosition`, `zoom` and `scrollX` are view state.
In the browser they live in `ViewState`, not in the session's document; they
are merged into the document when it is saved and split back out on load, so
reopening an adaptation restores where the editor was.

All times are **seconds** (floats). Edits snap to frame boundaries
(`Math.round(t * fps) / fps`). Every length is in **output pixels**.

## Track

| Field     | Type     | Notes                                             |
| --------- | -------- | ------------------------------------------------- |
| trackId   | string   | Unique within the document                        |
| type      | enum     | `video` or `audio`                                |
| name      | string   | Shown in the track header                         |
| muted     | boolean  | Video: hidden. Audio: silent                      |
| solo      | boolean  | When any track of a type is solo, only those play |
| locked    | boolean  | Clips cannot be edited or selected                |
| volume    | number   | Audio tracks: linear gain 0..2                    |
| opacity   | number   | Video tracks: 0..1, applied to the track's composite |
| blendMode | enum     | Video tracks: how the track combines with the tracks under it, see [Blend modes](#blend-modes) |
| effects   | Effect[] | Video tracks: applied to the track's composite, see [effects](#effects) |
| clips     | Clip[]   | Kept sorted by `timelineStart`, ties by `timelineEnd` |

Track order is display order, top to bottom. Video tracks always sit above
audio tracks. **The first video track is the front-most layer** (Vegas
convention: higher on screen = in front).

Only audio tracks produce sound. A video file's sound is a separate clip on
an audio track, joined to its picture by `linkedClipId`.

## Clip

| Field         | Type     | Notes                                              |
| ------------- | -------- | -------------------------------------------------- |
| clipId        | string   | Unique within the document                         |
| sourceFile    | string   | Absolute path. Empty for generators, titles and placeholders |
| sourceIn      | number   | Start of the clip's [source window](#source-window) |
| sourceOut     | number   | End of it: always `sourceIn` + the clip's duration |
| timelineStart | number   | Position on the timeline                           |
| timelineEnd   | number   | End on the timeline                                |
| fadeIn        | number   | Seconds; opacity (video) or gain (audio) ramp      |
| fadeOut       | number   | Seconds                                            |
| fadeInCurve   | enum     | Shape of the fade-in, see [Fade curves](#fade-curves) |
| fadeOutCurve  | enum     | Shape of the fade-out                              |
| volume        | number   | Clip gain 0..2 (audio tracks)                      |
| blendMode     | enum     | How the clip combines with what is under it        |
| linkedClipId  | string   | A/V partner: moves, trims, splits, deletes together |
| groupId       | string   | Clips sharing a groupId move together              |
| placeholder   | boolean  | An intention without media yet                     |
| label         | string   | Name shown on the clip                             |
| prompt        | string   | Generation prompt / search query / notes           |
| intent        | string   | narration, broll, sfx, music, title, transition    |
| color         | string   | Timeline colour override (hex)                     |
| generator     | object   | A synthetic source, see [generator](#generator)    |
| effects       | Effect[] | Applied in order after the clip is placed          |
| keyframes     | object   | Animated properties, see [keyframes](#keyframes)   |
| text          | object   | Title text block, see below                        |
| transform     | object   | Geometry, see below                                |

`clipKind(clip, track)` classifies a clip as `generator` (it names a
`generator.type`, whatever else it carries), `video`, `audio`, `image`,
`title` (no `sourceFile`, non-empty `text.content`) or `placeholder` (no
`sourceFile`, empty text).

### Source window

Every clip shows a window `sourceIn … sourceOut` of its source, at speed 1.
For video and audio the source is the file, so the window stays inside it.
A generator, title, image or placeholder has an **unbounded** source: its
window may start before 0 and end anywhere. Keyframes and generator motion
are timed in this source time (`sourceIn + (time − timelineStart)`), which is
what keeps them attached to the content: trimming a clip's start moves
`sourceIn`, slipping shifts the window, and splitting gives the right half
the later window — in all three, what was on screen at a moment stays there.

### Invariants

1. **Speed is 1.** For every clip `timelineEnd - timelineStart ===
   sourceOut - sourceIn`.
2. **Bounds.** `timelineStart >= 0` and `timelineEnd > timelineStart`. For
   video and audio clips `sourceIn >= 0`, and `sourceOut` never exceeds the
   source duration when it is known. Other clips have no source bounds.
3. **Fades fit.** `fadeIn >= 0`, `fadeOut >= 0`, `fadeIn + fadeOut <=
   duration`.
4. **Overlap means cross-fade.** Two clips on one track may overlap only as
   a cross-fade pair: one of them starts first *and* ends first (a clip is
   never inside another, and overlapping clips never share an edge), and the
   earlier clip's `fadeOut` and the later clip's `fadeIn` both equal the
   overlap length. No point on a track is covered by more than two clips.
   This is the Vegas "drag one clip over another" fade.
5. **Links are symmetric.** If A's `linkedClipId` is B then B's is A, and B
   exists.
6. **Structure.** Track, clip, marker and region ids are unique. Video
   tracks come before audio tracks and there is at least one of each. Clips
   are sorted by `timelineStart` (ties by `timelineEnd`), markers by `time`,
   regions by `start`.
7. **Animation data is sound.** Effect ids are unique within their clip or
   track. Every keyframe path addresses an animatable property of its clip,
   and its keys are sorted by `t`, at least 1 µs apart, with values that
   suit the property. Parameter bags hold only
   [bounded JSON-safe data](#free-form-data).

`validateEdl(edl, { sourceDurations? })` checks all of the above plus field
types and enums and returns `{ valid, problems: [{ path, message }] }`.
Times are compared with a 1 µs tolerance (`EPS`); the source-duration check
allows half a frame, because the frame grid rarely lands exactly on the end
of a source. `normalizeEdl(raw)` turns anything — an older file, LLM output,
garbage — into a document that passes.

Operations keep `timelineStart`/`timelineEnd` on the frame grid; source
times are not snapped. Being on the grid is not an invariant (changing an
adaptation's `fps` must not invalidate its timeline): `normalizeEdl`
re-snaps a document to its current `fps`.

### text

A clip with no `sourceFile` and a non-empty `text.content` is a title. It
lives on a video track and is composited like any other layer.

| Field        | Type    | Notes                                     |
| ------------ | ------- | ----------------------------------------- |
| content      | string  | May contain `\n` line breaks              |
| fontFamily   | enum    | A bundled family (`Inter`, `Playfair Display`, `JetBrains Mono`, `Bebas Neue`, `Caveat`) or a generic name (`sans-serif`, `serif`, `monospace`, `display`, `handwriting`). Anything else becomes `sans-serif` |
| fontSize     | number  | Pixels at output resolution               |
| color        | string  | Hex                                       |
| background   | string  | Box colour behind the text, empty = none  |
| align        | enum    | `left`, `center`, `right`                 |
| bold         | boolean |                                           |
| italic       | boolean |                                           |
| weight       | number  | 0 = from `bold` (700) / regular (400); else 1..1000 |
| outlineColor | string  | Hex                                       |
| outlineWidth | number  | Pixels, 0 = none                          |
| lineHeight   | number  | Multiple of `fontSize`. Default 1.2       |
| letterSpacing | number | Pixels                                    |
| maxWidth     | number  | Wrap width in pixels; 0 = no wrapping     |
| boxPadding   | number  | Padding of the background box, multiple of `fontSize`. Default 0.25 |
| boxRadius    | number  | Corner radius of the box, pixels          |
| shadowColor  | string  | Hex. Default `#000000`                    |
| shadowBlur, shadowX, shadowY | number | Pixels. A shadow is drawn when one of them is not 0 |
| animateIn, animateOut | object | How the text arrives and leaves, below |

`animateIn` / `animateOut`:

| Field    | Type   | Notes                                                 |
| -------- | ------ | ----------------------------------------------------- |
| type     | enum   | `none` (default), `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `blur`, `typewriter` |
| duration | number | Seconds each unit takes. Default 0.5                  |
| by       | enum   | `block` (default), `line`, `word`, `char`             |
| stagger  | number | Seconds between units. Default 0.05                   |
| ease     | enum   | An [easing](#keyframes). Default `ease-out`           |

The defaults draw exactly what v2 drew: line height 1.2, a box padded by a
quarter of the font size, no shadow, no animation.

### transform

| Field                | Type   | Notes                                           |
| -------------------- | ------ | ----------------------------------------------- |
| fit                  | enum   | `cover` (fill, crop overflow) or `contain`      |
| x, y                 | number | Offset from centred, **pixels at output resolution** |
| scaleX, scaleY       | number | Multiplier applied after fitting                |
| rotation             | number | Degrees clockwise, about the anchor             |
| opacity              | number | 0..1                                            |
| cropTop/Bottom/Left/Right | number | Fraction of the source removed, 0..1       |
| anchorX, anchorY     | number | 0..1 within the drawn rectangle                 |
| kenBurns             | object | Animated pan/zoom, see below                    |

Placement algorithm (preview and render must agree):

1. Crop the source by the crop fractions.
2. Fit the cropped source to the output frame (`cover` or `contain`),
   preserving aspect ratio.
3. Multiply the fitted size by `scaleX` / `scaleY`.
4. Centre it in the frame, then offset by `x`, `y`. The preview scales
   `x`/`y` by `previewWidth / outputWidth`.
5. Rotate about the anchor, apply `opacity` × fade factor.

### kenBurns

```json
{ "enabled": true, "startScale": 1.0, "endScale": 1.3, "startX": 0, "endX": -50,
  "startY": 0, "endY": 0, "startCropTop": 0, "endCropTop": 0 }
```

When `enabled`, `x`, `y`, `scaleX`/`scaleY` and the four crops are **replaced**
by a linear interpolation from the `start*` to the `end*` values over the
clip's duration (`startScale`/`endScale` drive both scale axes). A property
that is keyframed keeps its keyframed value instead
(`geometry.js` `resolveTransform`). When disabled the static transform
values apply. v1 documents had no `enabled` flag: on load, a v1 clip whose
start and end values differ is treated as enabled.

### generator

```json
{ "type": "gradient", "seed": 7, "params": { "angle": 90, "from": "#1e1b4b" } }
```

A synthetic source drawn by the compositor. `type` names a generator of the
catalog (`src/utils/compose/catalog.js`); empty = the clip is not a
generator. `seed` (0..4294967295) feeds its randomness. `params` holds only
what differs from the generator's defaults.

### effects

```json
[{ "effectId": "fx_1", "type": "blur", "enabled": true, "params": { "radius": 8 } }]
```

A stack, applied in order — on a clip after it is placed, on a track to the
track's composite. `effectId` is unique within its stack (letters, digits,
`_`, `-`) and is what keyframe paths refer to; `type` names an effect of the
catalog; a disabled effect keeps its settings. At most 64 per stack.

### keyframes

```json
{
  "transform.x": [{ "t": 0, "v": -400, "ease": "ease-out" }, { "t": 1.2, "v": 0, "ease": "linear" }],
  "effects.fx_1.radius": [{ "t": 0, "v": 30, "ease": "linear" }, { "t": 0.8, "v": 0, "ease": "linear" }],
  "text.color": [{ "t": 0, "v": "#ffffff", "ease": "linear" }, { "t": 2, "v": "#f97316", "ease": "linear" }]
}
```

A map from a property **path** to its keys.

- **`t`** is seconds in clip-local source time: `sourceIn + (time −
  timelineStart)`. Keys are sorted by `t`; a key may lie outside the clip's
  window (trimmed away) and still shapes the values inside.
- **`v`** is a number or a hex colour (`#rrggbb` / `#rrggbbaa`).
- **`ease`** shapes the segment leaving its key: `linear`, `hold`,
  `ease-in`, `ease-out`, `ease-in-out`, `back-in`, `back-out`,
  `elastic-out`, `bounce-out`, `sine`.
- Before the first key a property holds the first value; after the last,
  the last. A keyframed property overrides the plain value stored in the
  clip, which stays underneath and returns when the keys are cleared.

| Path                                   | Animates                     | Values |
| -------------------------------------- | ---------------------------- | ------ |
| `volume`                               | Clip gain — a volume envelope | number, clamped 0..2 |
| `transform.<field>`                    | Any numeric transform field (also `transform.kenBurns.<field>`) | number, clamped to the field's range |
| `text.<field>`                         | Numeric text fields (`fontSize`, `letterSpacing`, `animateIn.duration`…) and the colours `color`, `background`, `outlineColor`, `shadowColor` | number / colour |
| `generator.seed`, `generator.params.<name>[.<sub>…]` | Generator parameters; only on a generator clip | number or colour |
| `effects.<effectId>.<param>[.<sub>…]`  | A parameter of one effect the clip has | number or colour |

Nothing else can be keyframed — not times, fade lengths, ids, enumerations
or text content (`describePath(clip, path)` tells). At most 256 animated
paths per clip and 2000 keys per path. `animate.js`
`resolveClip(clip, time)` returns the clip with every keyframed property
replaced by its value at that moment; everything downstream reads plain
values.

### Blend modes

`normal`, `add`, `screen`, `multiply`, `overlay`, `darken`, `lighten`,
`difference`, `soft-light` — for `clip.blendMode` and `track.blendMode`.

### Fade curves

`fadeInCurve` / `fadeOutCurve` shape a fade. Each curve is one formula of
the progress `p` through the fade (0 → 1); **a fade-in has level `f(p)`, a
fade-out `1 − f(p)`**, for picture opacity and audio gain alike
(`src/utils/edl/fadeCurves.js`).

| Curve    | `f(p)`               | Character                 | FFmpeg `afade` in / out |
| -------- | -------------------- | ------------------------- | ----------------------- |
| `linear` | `p`                  | Constant rate (default)   | `tri` / `tri`           |
| `smooth` | `(1 − cos(π·p)) / 2` | Eases in and out          | `hsin` / `hsin`         |
| `fast`   | `1 − (1 − p)²`       | Most of the change early  | `ipar` / `qua`          |
| `slow`   | `p²`                 | Most of the change late   | `qua` / `ipar`          |
| `sharp`  | `acos(1 − 2·p) / π`  | Quick at both ends        | `ihsin` / `ihsin`       |

Two clips cross-fading with the same curve always sum to 1. (`afade`
evaluates a fade-out on the time remaining, hence the swapped names.)

### Free-form data

`generator.params` and effect `params` are not described by this schema —
the catalog knows them — so they are stored as given, but only as bounded
JSON-safe data: finite numbers, strings (up to 20 000 characters),
booleans, and plain objects and arrays of those, nested at most 6 deep and
2000 values per bag. Anything else — `null`, `NaN`, functions, class
instances, cycles, `__proto__` / `constructor` / `prototype` keys — is
dropped on load and refused by `validateEdl`.

## Versions, loading and saving

`normalizeEdl(raw)` accepts v1, v2 and v3 documents and returns valid v3:

- **v1** (no `version`; `id` keys, a `project` header, missing fields) and
  **v2** documents get the v3 defaults, which draw exactly what they drew.
  Their titles, images and placeholders had no source window: they get
  `sourceIn: 0`, `sourceOut: duration`. No clip moves.
- A document with `version >= 3` keeps its source windows, also negative.
  So does any clip that carries a `generator` or `keyframes` block, whatever
  the version says — a hand-written document may leave the version out.
- Unknown blend modes, curves, easings, fonts and text animations fall back
  to their defaults; keys without a finite `t` or a usable `v` are dropped,
  as are paths that address nothing; repeated or malformed effect ids are
  replaced; everything else is repaired as strictly as before.

`toSavedDocument(edl, view)` writes the document fields above plus the view
fields; `fromSavedDocument(doc)` normalises and splits them again. A valid
v3 document survives normalise → save → load unchanged. The server
normalises on `GET` and `PUT …/edl/:aid` (`src/api/projects/edl.js`) and
answers 422 for a structurally broken document or one that still breaks an
invariant after normalising.

## Operations

Every edit is a pure function `(edl, ...args) => edl` in `src/utils/edl/`,
exported from `src/utils/edl/index.js`. An operation never mutates its
input and shares everything it did not change: untouched tracks and clips
keep their identity, and an operation that changes nothing returns the very
same document. The module map, the reference of the keyframe, effect,
generator and attribute operations, and the editing rules (locked tracks,
linked clips, cross-fade or overwrite, fades, trim limits, ripple, director
results) are in **[EDL-OPERATIONS.md](./EDL-OPERATIONS.md)**.

## Rendering Semantics

- The frame starts as `background`. Layers composite back to front: last
  video track first, first video track last. Clips on one track draw in
  `timelineStart` order. A track with `opacity` below 1, a blend mode or
  effects is composed on its own surface first.
- **Video cross-fades are true dissolves.** While a later clip on the same
  track fades in over it, the outgoing clip stays fully opaque underneath;
  its `fadeOut` is ignored for picture. A `fadeOut` with nothing cross-fading
  over it fades to whatever is behind (lower tracks, or the background).
  `levels.js` `videoOpacity(track, clip, time)` implements this; a clip's
  opacity is `transform.opacity × videoOpacity`.
- Audio from all audible audio tracks is summed. Gain at any moment is
  `track.volume × clip.volume × fadeFactor` (`levels.js` `clipGain`); audio
  cross-fades are equal-gain, so both clips ramp.
- Fades follow their [curves](#fade-curves). The level functions read plain
  values: resolve a clip with `resolveClip` first and a keyframed `volume`
  or `transform.opacity` is an envelope. `gainEnvelope(track, clip)` samples
  a clip's gain over its length for the audio paths.
- Gaps render as the background and silence.
- Output frame size and rate come from `resolution` and `fps`.
- Placeholders render as nothing (they are planning aids).
