# The frame compositor

One compositor draws every NearEdit picture: the browser preview runs it on an
HTML canvas, the server runs the same modules on `@napi-rs/canvas`. Contract:
[COMPOSITOR.md](../../../docs/app-spec/COMPOSITOR.md). This file is the
working manual: what is exported, and how to add a generator or an effect.

Everything in this folder is isomorphic. It never touches `document`,
`window`, `OffscreenCanvas`, `Path2D`, `fetch` or the file system — only the
`ctx` it is given and the host `env`.

## Drawing a frame

```js
import { drawFrame, frameInfo, requirements } from '#utils/compose/index.js';

drawFrame(ctx, edl, time, env, frameInfo(edl, canvas.width, canvas.height));
```

- `time` is timeline seconds. A frame is a pure function of `(edl, time)`:
  draw any frame, in any order, and get the same pixels.
- `env` is the host: `{ createCanvas(w, h), image(path), frameOf(clip, sourceTime), fontReady(font, text) }`
  — and, for captions, `words(clip)`: the transcript of a captioned clip's file.
  `image` and `frameOf` return something `drawImage` takes, or `null` while
  it is not available (the layer is then left out of that frame).
  For a clip drawn through its matte (`cutout`, docs/app-spec/CUTOUT.md)
  `frameOf` hands over the frame of its cutout file — the picture on the
  left, its matte on the right — or the plain frame while that is not there:
  the compositor tells the two apart by their shape.
- Keep one `env` object per canvas size. Scratch canvases are pooled per
  `env`, so a steady stream of frames allocates nothing.
- `requirements(edl)` → `{ images: [path], fonts: [{ font, text }], words: [path] }`, what
  to load first. `layersAt(edl, time)` → the layers of a frame back to
  front, each with `kind` (`video`, `image`, `title`, `generator`,
  `element`) and `sourceTime` — how a host knows which footage frames a
  frame needs.

Hosts: `#utils/playback/paintFrame.js` (browser) and `src/api/compose/`
(Node: `createEnv`, `loadImages`, `registerFonts`, `renderFrame`).

## What modules receive

| Argument | Contents                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `params` | Every parameter of the schema: the stored value if usable, else the default. Generators also get `params.seed` (the clip's `generator.seed`) |
| `time`   | `t` (clip-local seconds, the keyframe time base), `age`, `remaining`, `duration`, `frame` (output frame number)                              |
| `frame`  | `width`, `height` (canvas pixels), `scale` (canvas pixels per output pixel), `fps`, `outWidth`, `outHeight`                                  |
| `env`    | `image(path)`, `frameOf(clip, t)`, `fontReady(font, text)`, `createCanvas(w, h)` and `scratch(w?, h?)`                                       |

`env.scratch()` lends a blank pooled surface `{ canvas, ctx, width, height }`
(frame-sized by default) and takes it back when the module returns. Use it
instead of `createCanvas`, which allocates. A surface whose pixels will be
read back (`getImageData`) is asked for with `env.scratch(w, h, true)`: a
browser then keeps it where reading costs nothing.

Rules every module follows:

1. **Lengths are output pixels.** Multiply by `frame.scale` before drawing.
   `tests/compose/resolution.test.js` draws at 480 and 1920 pixels wide and
   fails when a length is not scaled.
2. **No hidden state.** No `Math.random`, no clock, nothing kept between
   frames. Randomness comes from `random.js`: `rand(seed, key…)` is a stable
   value in [0, 1) per seed and keys (a particle index, a cell), plus `hash`,
   `randRange`, `createRandom`, `noise2`, `noise3`, `fractal`.
3. **Canvas 2D only**, and only what both canvases draw alike: paths,
   `roundRect`, gradients, `drawImage`, `globalAlpha`,
   `globalCompositeOperation`, shadows, `filter`, text, image data. Pixel
   loops belong on small grids (see `generators/noise.js`).
4. A module may leave the context in any state; the pipeline restores it. A
   module that throws is skipped for that frame with one warning.
5. Import what a module needs from this folder by alias —
   `#utils/compose/random.js`, `#utils/compose/color.js`,
   `#utils/compose/filterPass.js` — never with `../`.

## Adding a generator

A generator paints a blank, transparent, frame-sized canvas; the pipeline
then places it with the clip's transform like any other source. Write
`generators/<type>.js`:

```js
/** @type {import('#utils/compose/catalog.js').GeneratorModule} */
export default {
  type: 'rings',
  label: 'Rings',
  category: 'background', // background | shape | text | particles | pattern
  description: 'Concentric rings',
  params: {
    spacing: { type: 'number', default: 80, min: 4, max: 2000, unit: 'px', animatable: true },
    color: { type: 'color', default: '#ffffff', animatable: true },
  },
  draw(ctx, params, time, frame, env) {
    const step = params.spacing * frame.scale;
    ctx.strokeStyle = params.color;
    for (let r = (time.t * step) % step; r < frame.width; r += step) {
      ctx.beginPath();
      ctx.arc(frame.width / 2, frame.height / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
};
```

and add it to the array in `generators/index.js`. That is all: the catalog,
`requirements` (for `image` parameters), keyframes
(`generator.params.<name>`) and the tests that check every schema pick it up.

A generator that only adds its own marks with ordinary blending — it never
clears, reads back or changes the composite operation — may say `direct:
true`: an untransformed, opaque clip of it is then drawn straight over the
picture instead of through a surface of its own (`shape`, `solid`,
`gradient`, `pattern`).

## Adding an effect

An effect works on a frame-sized surface holding the clip (or track) after
its transform. It is one of two kinds. Write `effects/<type>.js`:

```js
/** A filter effect: a CSS filter string. */
export default {
  type: 'sepia',
  label: 'Sepia',
  category: 'color', // color | blur | stylize | light | key | distort
  params: { amount: { type: 'number', default: 1, min: 0, max: 1, animatable: true } },
  filter: (params, frame, time) => `sepia(${params.amount})`,
  // Only for filters that sample around each pixel: how far, canvas pixels.
  // reach: (params, frame) => params.radius * frame.scale * 3,
};
```

```js
/** An apply effect: redraw `surface.canvas` in place. */
export default {
  type: 'mirror',
  label: 'Mirror',
  category: 'distort',
  params: {},
  apply(surface, params, time, frame, env) {
    const copy = env.scratch();
    copy.ctx.drawImage(surface.canvas, 0, 0);
    surface.ctx.setTransform(-1, 0, 0, 1, surface.width, 0);
    surface.ctx.clearRect(0, 0, surface.width, surface.height);
    surface.ctx.drawImage(copy.canvas, 0, 0);
  },
};
```

and add it to the array in `effects/index.js`. Notes:

- Return `''` from `filter` for "no change". Neighbouring filter effects are
  merged into one pass.
- With `reach`, the pipeline repeats the surface's edge pixels outward
  before filtering, so a blur does not darken the border of a full-frame
  picture. `filterPass.js` exports the same for apply effects:
  `drawFiltered(ctx, surface, filter, reach, env)` (see `effects/glow.js`).
- Surfaces are transparent where the layer is not; keep them so, or the
  effect will hide what is underneath.
- Parameters are keyframed as `effects.<effectId>.<name>`.

## Parameter schema

`type`: `number` (`min`, `max`, `step`, `unit`), `color` (hex), `boolean`,
`select` (`options`), `text`, `image` (a media path; read it with
`env.image(path)`), `point` (`{ x, y }` in fractions of the frame). Also
`label`, `animatable`, and `when: { otherParam: [values] }` — a hint for
editors to show a control only while another parameter has one of those
values. Do not name a parameter `seed`.

## Where things are

| File                                            | Job                                                            |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `drawFrame.js`, `drawClip.js`, `layers.js`      | The layer pipeline                                             |
| `place.js`                                      | Transform placement: pictures, generator canvases, vector text |
| `applyEffects.js`, `filterPass.js`              | The effect pipeline                                            |
| `pool.js`, `host.js`                            | Pooled scratch surfaces; the module `env`                      |
| `catalog.js`, `params.js`, `blend.js`           | Registry, parameter resolution, blend modes                    |
| `frame.js`, `color.js`, `random.js`, `fonts.js` | Time and size, colours, randomness, bundled fonts              |
| `text/`                                         | Titles: style, wrapping, layout, animation, drawing            |
| `elementLayer.js`, `elementExpansion.js`        | Brand element clips: expanded into layers, kept between frames |
| `fontFaces.js`, `fontRegistrar.js`              | A document's own fonts, as data and as faces in the browser    |
| `generators/`, `effects/`                       | One module each, listed in their `index.js`                    |

## Text

Titles are drawn as vectors with `textRendering: geometricPrecision`: no
hinting, exact outlines. With it, and with the server canvas set to draw
text as Chrome does (`src/api/compose/fonts.js`), the two canvases produce
the same glyph pixels. On both, a line of upright text is positioned to a
fraction of a pixel horizontally but to a whole pixel row vertically (the
rasteriser's glyph cache), so very slow vertical text motion moves in steps
of one canvas pixel.

Fonts must go through `fontString()`, which only ever names a bundled face.

## Tests

```bash
node --test "src/utils/compose/**/*.test.js" src/api/compose/*.test.js
CHROMIUM_PATH=/path/to/chromium node --test tests/compose/*.test.js
```

`tests/compose/parity.test.js` draws the reference documents in
`tests/compose/cases/` on the server canvas and in Chromium and compares
pixels (`PARITY_OUT=dir` saves them). Add a case there for anything new.
