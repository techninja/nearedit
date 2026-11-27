# Effects

The effects library of the frame compositor
([COMPOSITOR.md](./COMPOSITOR.md)): nineteen effects for clips and tracks,
each written once and drawn by the same code in the browser preview and in
the server render. `tests/compose/parity.test.js` draws every one of them on
both canvases; on Linux all effect frames are **bit-identical**.

```json
{
  "effects": [
    { "effectId": "fx_1", "type": "colorAdjust", "enabled": true, "params": { "contrast": 1.2 } },
    { "effectId": "fx_2", "type": "vignette", "enabled": true, "params": {} }
  ],
  "keyframes": { "effects.fx_1.contrast": [{ "t": 0, "v": 1 }, { "t": 2, "v": 1.4 }] }
}
```

Code: `src/utils/compose/effects/` — one module per effect, listed in
`index.js`; shared techniques in `lib/`; ready-made stacks in `presets.js`.
`nearedit catalog` prints every schema. A document stores only the
parameters that differ from the defaults below. Lengths are output pixels
(they scale with a smaller preview), angles degrees clockwise, colours hex.

## The library

| Effect | Kind | What it does |
| ------ | ---- | ------------ |
| `colorAdjust` | filter | Brightness, exposure, contrast, saturation, hue |
| `colorBalance` | apply | Temperature, tint, red / green / blue gain |
| `levels` | apply | Black point, white point, midtones, output range |
| `tint` | apply | Colourise towards one colour, or duotone (shadows → highlights) |
| `stylize` | filter | Grayscale, sepia, invert — each by an amount |
| `posterize` | apply (pixels) | A few levels per colour channel |
| `blur` | apply | Gaussian, or directional (motion) blur |
| `glow` | apply | Bloom: blurred light from what is brighter than a threshold |
| `dropShadow` | filter | Offset, blurred, coloured shadow of the layer's shape |
| `vignette` | apply | Darkens or tints towards the frame's corners |
| `grain` | apply | Film grain, new on every frame |
| `scanlines` | apply | Evenly spaced lines, optionally rolling |
| `flicker` | filter | Brightness or opacity that wavers over time |
| `pixelate` | apply | Mosaic of square blocks |
| `rgbSplit` | apply (pixels) | Chromatic aberration: red and blue shifted apart |
| `mirror` | apply | One half reflected onto the other |
| `chromaKey` | apply (pixels) | Makes a colour transparent; soft edge, spill suppression |
| `mask` | apply | Keeps a rectangle, rounded rectangle or ellipse |
| `wipe` | apply | Soft-edged reveal by progress: linear, radial, iris, clock |

**Filter** effects are one or more CSS filter functions; neighbours in a
stack are merged into a single pass. **Apply** effects redraw the layer with
composite operations; three of them, marked *pixels*, read the pixels
because no canvas operation can do the job.

## Parameters

Every parameter marked ◆ can be keyframed (`effects.<effectId>.<name>`; a
point as `center.x` / `center.y`).

### colorAdjust

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `brightness` ◆ | 1 | 0..4 | Multiplier |
| `exposure` ◆ | 0 | −4..4 stops | The same gain in stops: × 2 per stop |
| `contrast` ◆ | 1 | 0..4 | Scales about mid grey: `(x − 0.5) · c + 0.5` |
| `saturation` ◆ | 1 | 0..4 | 0 is grey (luma 0.2126 / 0.7152 / 0.0722) |
| `hue` ◆ | 0 | −180..180° | Hue rotation |

Applied in that order, clamped after each. Brightness and exposure fold
into one function, so `brightness 0.5` with `exposure 1` is exactly nothing.

### colorBalance

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `temperature` ◆ | 0 | −1..1 | Warm: red × (1 + 0.3 t), blue × (1 − 0.3 t) |
| `tint` ◆ | 0 | −1..1 | Towards magenta: green × (1 − 0.3 t) |
| `red`, `green`, `blue` ◆ | 1 | 0..4 | Gain of one channel |

### levels

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `black`, `white` ◆ | 0, 1 | 0..1 | `x₁ = (x − black) / (white − black)`, clamped |
| `midtones` ◆ | 0 | −1..1 | `x₂ = x₁ + m · x₁ · (1 − x₁)`: lifts or lowers the middle |
| `outBlack`, `outWhite` ◆ | 0, 1 | 0..1 | `out = outBlack + (outWhite − outBlack) · x₂` |

`midtones −1` is exactly gamma 2 (x²); `+1` its mirror image. A true power
curve is not something the two canvases compute alike without a pixel loop;
this curve is the picture blended with itself.

### tint

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `mode` | `colorize` | `colorize`, `duotone` | |
| `amount` ◆ | 1 | 0..1 | Mix with the original |
| `color` ◆ | `#f59e0b` | colour | colorize: its hue and saturation, the pixel's lightness |
| `shadows`, `highlights` ◆ | `#1e1b4b`, `#fde68a` | colour | duotone: what black and white become |

Lightness is 0.30 R + 0.59 G + 0.11 B. Colorize keeps black black and white
white.

### stylize

`grayscale`, `sepia`, `invert` ◆ — each 0..1, default 0, applied in that
order.

### posterize

`levels` ◆ — 2..64, default 4. A channel value v becomes
`floor(v · n) / (n − 1)`.

### blur

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `kind` | `gaussian` | `gaussian`, `directional` | |
| `radius` ◆ | 8 | 0..200 px | Gaussian: standard deviation. Directional: reach each way |
| `angle` ◆ | 0 | −360..360° | Directional: 0 is horizontal, 90 vertical |

A directional blur is an even streak `2 × radius` long, sharp across its
direction.

### glow

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `radius` ◆ | 20 | 0..200 px | Standard deviation of the halo |
| `intensity` ◆ | 0.8 | 0..4 | How much of the halo is added |
| `threshold` ◆ | 0 | 0..0.95 | Only `(x − t) / (1 − t)` of each channel glows |

### dropShadow

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `x`, `y` ◆ | 12, 12 | −500..500 px | Offset |
| `blur` ◆ | 8 | 0..200 px | Standard deviation |
| `color` ◆ | `#000000` | colour | |
| `opacity` ◆ | 0.6 | 0..1 | |

### vignette

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `amount` ◆ | 0.6 | 0..1 | Strength at full |
| `size` ◆ | 0.7 | 0..1.5 | Where it is half way: 0 the centre, 1 the corner |
| `softness` ◆ | 0.6 | 0..2 | Width of the S-curve from nothing to `amount` |
| `roundness` ◆ | 0 | 0..1 | 0 an ellipse through the corners, 1 a circle |
| `color` ◆ | `#000000` | colour | |
| `center` ◆ | 0.5, 0.5 | point | Fractions of the frame |

### grain

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `amount` ◆ | 0.25 | 0..1 | At 1 a mid grey swings by up to ±50 % |
| `size` ◆ | 1.5 | 0.5..32 px | Size of one grain |
| `colored` | false | | Separate noise per channel |
| `animated` | true | | New grain on every output frame |
| `variant` | 1 | 0..9999 | Another pattern |

Blended in `overlay` mode: strongest in the midtones, nothing in pure black
or white, and the picture's level does not move.

### scanlines

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `spacing` ◆ | 6 | 2..400 px | From one line to the next |
| `thickness` ◆ | 0.5 | 0..1 | Part of the spacing that is line |
| `opacity` ◆ | 0.35 | 0..1 | |
| `color` ◆ | `#000000` | colour | |
| `angle` ◆ | 0 | −180..180° | 0 is horizontal |
| `speed` | 0 | ±2000 px/s | Rolls the lines |

### flicker

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `mode` | `brightness` | `brightness`, `opacity` | What wavers |
| `amount` ◆ | 0.15 | 0..1 | Brightness 1 ± amount; opacity 1 − amount..1 |
| `rate` | 12 | 0..60 /s | Changes per second; 0 = every frame |
| `smooth` | false | | Glide between levels |
| `variant` | 1 | 0..9999 | Another sequence |

### pixelate

`size` ◆ — block size, 1..400 px, default 24. The grid is centred on the
frame; each block shows the average around its middle.

### rgbSplit

`distance` ◆ (0..400 px, default 8) and `angle` ◆ (default 0): red is
shifted `distance` along the angle, blue the same way back.

### mirror

`mode`: `horizontal` (left onto right), `vertical` (top onto bottom), `quad`
(top-left onto all four). `reverse` keeps the other side.

### chromaKey

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `color` ◆ | `#00ff00` | colour | The colour to remove |
| `tolerance` ◆ | 0.2 | 0..1 | Chroma distance up to which a pixel is removed |
| `softness` ◆ | 0.1 | 0..1 | Width of the fade beyond that |
| `spill` ◆ | 0.5 | 0..1 | How much key-coloured cast is taken out of what stays |

Distance is between BT.601 chromas (Cb, Cr), in units of the full range:
lightness is ignored, and pure green is 0.53 from any grey. Keep
`tolerance + softness` below the distance to the nearest colour worth
keeping. A grey key colour has no chroma to key on.

### mask

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `shape` | `ellipse` | `rectangle`, `ellipse` | |
| `center` ◆ | 0.5, 0.5 | point | Fractions of the frame |
| `width`, `height` ◆ | 0.5, 0.5 | 0..4 | Fractions of the frame |
| `rotation` ◆ | 0 | degrees | |
| `radius` ◆ | 0 | 0..4000 px | Corner radius of a rectangle |
| `feather` ◆ | 0 | 0..1000 px | About the width of the soft edge |
| `invert` | false | | Keep everything but the shape |

### wipe

| Parameter | Default | Range | |
| --------- | ------- | ----- | --- |
| `progress` ◆ | 0.5 | 0..1 | 0 shows nothing, 1 everything — exactly |
| `shape` | `linear` | `linear`, `radial`, `iris`, `clock` | |
| `angle` ◆ | 0 | −360..360° | See below |
| `feather` ◆ | 40 | 0..2000 px | Width of the soft edge |
| `center` ◆ | 0.5, 0.5 | point | radial, iris, clock |
| `invert` | false | | Reveal the opposite part: the same progress wipes off |

- `linear`: a straight edge travelling in the direction of `angle` (0° left
  to right, 90° top to bottom); what it has passed is shown.
- `radial`: a circle growing from the centre.
- `iris`: a box with the frame's proportions opening from the centre;
  `angle` turns it (45° is a diamond).
- `clock`: a hand sweeping clockwise from `angle` (0° is 12 o'clock); the
  feather is measured half-way out to the farthest corner.

Keyframe `progress` from 0 to 1 and the clip wipes on. On the incoming clip
of two that overlap (on tracks one above the other) it is a transition.

## Alpha

A layer's surface is transparent wherever the layer is not. What each
effect does there:

| Effect | The layer's alpha |
| ------ | ----------------- |
| `colorAdjust`, `stylize`, `colorBalance`, `levels`, `tint`, `posterize`, `grain` | **Untouched.** Only colours change; a soft edge gets no fringe |
| `vignette`, `scanlines` | **Untouched.** They paint only where the layer is |
| `flicker` | Untouched in `brightness` mode; scaled as a whole in `opacity` mode |
| `chromaKey`, `mask`, `wipe` | **Reduced**, never added: multiplied by the key or the shape |
| `blur` | **Spreads**: edges soften and reach about 3 × radius past the layer (a directional blur: radius, along its angle) |
| `glow` | **Grows where light lands**: the halo carries only as much alpha as its brightest channel. A dark layer casts none |
| `dropShadow` | **Grows** by the shadow, behind and beside the layer |
| `rgbSplit` | **Grows** by `distance` each way: a pixel takes the largest alpha of its three shifted channels, so even areas keep theirs |
| `pixelate` | Pixelated with the picture: a block's alpha is the average around its middle |
| `mirror` | Moves with the picture |

A picture that fills the frame has no "outside": `blur`, `glow` and the
directional blur repeat its edge pixels outward before they sample, so its
borders stay solid instead of fading.

Effects act in **frame space**, after the clip's transform. A mask, a wipe,
a vignette, scanlines and grain belong to the frame, not to the clip: move
the clip and the picture slides under them. To move a mask with a clip,
keyframe its `center`.

## Order

Effects run top to bottom, each on the result of the one before. Fades, clip
opacity and the blend mode come after the whole stack; track effects run on
the track's clips composed together. Rules of thumb:

1. **Key first.** `chromaKey` reads the original colours; anything before it
   changes what it keys on.
2. **Colour next** — `colorAdjust`, `colorBalance`, `levels`, `tint`,
   `stylize`. Put the two filter ones (`colorAdjust`, `stylize`) next to each
   other and they run as one pass.
3. **Then what reshapes** — `blur`, `pixelate`, `mirror`, `rgbSplit`.
4. **Cut before you light.** `mask` then `dropShadow` gives the cut-out shape
   a shadow; `dropShadow` then `mask` cuts the shadow off with the rest.
   `glow` after `mask` glows around the new edge.
5. **Frame overlays last** — `vignette`, `grain`, `scanlines`, `flicker` —
   so they are not blurred, split or masked with the picture.
6. **A `wipe` used as a transition goes last**, so the glow and the shadow
   come and go with the layer.

Every step works on 8-bit colours, so a stack of many colour effects loses
a level here and there; one `levels` or `colorAdjust` doing the whole change
is cleaner than three doing a third each.

There is no adjustment layer: a look for the whole picture goes on every
track that makes it up, or the picture is put on one track.

## Presets

`EFFECT_PRESETS` (`effects/presets.js`, also in `catalog()` as
`effectPresets`): `{ name, label, description, effects: [{ type, params }] }`.
Add the effects in order.

| Preset | Effects, in order |
| ------ | ----------------- |
| `cinematic` | colorAdjust (contrast 1.15, saturation 0.85) → vignette (0.5, size 0.75, softness 0.7) → grain (0.18) |
| `dream` | blur (2) → glow (36, 0.45, threshold 0.5) → levels (midtones 0.2, outBlack 0.06) |
| `vhs` | colorAdjust (contrast 0.92, saturation 1.25) → rgbSplit (6) → scanlines (opacity 0.25) → grain (0.3, size 2.5, coloured) → flicker (0.06, every frame) |
| `noir` | stylize (grayscale 1) → colorAdjust (contrast 1.35) → vignette (0.7, size 0.65, softness 0.7) → grain (0.22, size 2) |
| `warm` | colorBalance (temperature 0.4) → colorAdjust (saturation 1.1) |
| `cool` | colorBalance (temperature −0.4) → colorAdjust (saturation 0.95) |
| `spotlight` | vignette (0.9, size 0.42, softness 0.4, roundness 1) |
| `vintage` | stylize (sepia 0.75) → levels (outBlack 0.08, outWhite 0.95) → vignette (0.45, softness 0.8) → grain (0.22, size 2) |
| `neon` | glow (6, 1) → glow (40, 0.7) — for titles and shapes; on footage it floods |
| `glitch` | rgbSplit (18, 12°) → posterize (6) → scanlines (spacing 12, thickness 0.3, opacity 0.4, speed 240) |

## How they are made

Only what both canvases draw alike is used, and measured to be so: CSS
filter functions, every composite operation and blend mode, gradients
(linear, radial, conic), unsmoothed scaling, `getImageData`.

- **Straight colours** (`lib/straight.js`). A canvas stores colour × alpha,
  and a blend mode mixes a layer with whatever is drawn over it wherever
  the layer is not opaque — multiplying a soft-edged layer by a colour would
  leave a fringe of that colour. So `colorBalance`, `levels`, `tint` and
  `grain` first make an opaque copy of the layer's un-multiplied colours
  (the layer over black, divided by its alpha with `color-dodge`), blend on
  that, and paint the result back through the layer's own alpha with
  `source-atop`. Exact for opaque layers, within a level elsewhere.
- **Reduced copies** (`lib/reduce.js`) — see Performance.
- **Averaging without drift** (`lib/average.js`). An 8-bit canvas rounds the
  same way every time it halves a picture, and a chain of halvings visibly
  brightens or darkens. Drawn at 127/255 onto nothing a value is rounded
  down, added at 128/255 it is rounded up: the two halves sum to the whole.
  The directional blur and every halving are built from such pairs; a flat
  colour stays exactly itself through any number of them.
- **Gradient masks** (`lib/soft.js`, `lib/wipeShapes.js`). `vignette` and
  `wipe` are gradients with enough stops to follow an S-curve; they cost
  one or two fills whatever the feather.
- **Pixel passes** (`lib/pixels.js`). `chromaKey`, `rgbSplit` and
  `posterize` read the surface once, work on a typed array at the canvas's
  own size, and write it back; `glow` does so on its reduced halo.

## Performance

Measured on a 4-core machine that other jobs were loading at the time
(the compositor's reference pair, blur 8 + glow 20, took 51 ms in the same
session where its author measured 47): one 1920 × 1080 footage layer with
the effect, a whole frame, median of 21. Server: `@napi-rs/canvas`.
Chromium: 158, software-rasterised, frames presented per second (60 Hz cap).

| 1920 × 1080 footage with… | Server, ms | Chromium 1080p, fps | Chromium 960 × 540, fps |
| --- | ---: | ---: | ---: |
PERF_TABLE

Presets are their effects added up: from `spotlight` (18 ms; 62 fps) to `vhs`
(100 ms on the server; 13 fps at 1080p and 38 fps at 960 × 540 in Chromium).

**The reduced path.** A wide blur holds no fine detail, so `blur` and `glow`
make it on a copy halved a few times and enlarge the result. The rule:

- `blur`: halve while the blur stays at least **6 pixels** wide on the copy
  — from 12 canvas pixels of radius up. Against the canvas's own full-size
  blur the result is within 3 levels for 99.9 % of values, 0.3 on average
  (measured at radius 12 to 96 on three pictures). Below 5.5 pixels on the
  copy the two differ by 10 and more on sharp detail, hence the floor.
- `glow`: always at least halved, then while the halo stays at least
  **2 pixels** wide on the copy. A soft layer of added light hides the
  coarser copy.
- `mask`: its feather is blurred on a mask reduced to 1.5 pixels of blur.

The rule counts canvas pixels, so a small preview may blur directly where
the render reduces; `tests/compose/resolution.test.js` holds both to the
same picture.

| | Server, ms: before → after | Chromium 1080p, fps: before → after | Chromium 960 × 540, ms: before → after |
| --- | ---: | ---: | ---: |
BEFORE_TABLE

"Before" is the original one-pass filter blur and blurred-copy glow, run in
the same frame loop, alternating with the new one.

What costs what:

- A filter pass costs what its clip covers, whatever the layer holds, and
  each function in it costs its own traversal: merging filter effects saves
  one copy of the surface, not the functions.
- The straight-colour effects pay about 10 ms at 1080p for the copy that
  protects alpha, even when the layer is opaque.
- Pixel passes cost 5 to 20 ms per megapixel on a software canvas. On a
  GPU-backed browser canvas reading pixels back is slower than that; a
  preview at 960 pixels pays a quarter.

## Exactness and limits

- **Across canvases:** every reference frame in
  `tests/compose/cases/effects.js` is identical byte for byte on
  `@napi-rs/canvas` and Chromium 158.
- **Across sizes:** a 480-pixel frame against a 1920-pixel one averaged
  4 × 4 differs by 0.1 to 1.35 levels on average over the effect cases
  (bound 1.5). One thing does not fit that bound: **fine tilted scanlines**.
  They go through the canvas's path anti-aliasing, which is approximate for
  lines a pixel or two wide: 14-pixel lines at 20° on a 480-pixel preview
  differ from the averaged render by 2.1 levels on average. Upright lines
  are exact rectangles and do fit (0.44).
- A directional blur shifts by whole canvas pixels: across its direction a
  tilted streak wanders by up to a pixel, and it carries 8 bits per step,
  so a single bright pixel smeared over hundreds loses a few percent.
- `rgbSplit` positions channels to a sixteenth of a pixel.
- Grain repeats every 128 grains each way.
- Enlarging a reduced copy rounds down: a reduced blur is about 0.3 levels
  darker than a direct one.
- Gradients, glows and vignettes are 8-bit: very dark, very wide ones show
  the steps any 8-bit picture would.

Not in the library: an outline of the layer's alpha, kaleidoscope, zoom
blur, a true gamma curve, luma key.
