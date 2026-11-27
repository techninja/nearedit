# Particles

The `particles` generator draws many copies of one sprite — a built-in
shape or **any image of the project** — born by an emitter, moving and
changing over their lives: snow, rain, dust, sparks, embers, confetti,
bubbles, fireflies, a burst on the beat, a logo raining down.

It is a compositor generator like any other
([COMPOSITOR.md](./COMPOSITOR.md)): a clip with
`generator: { type: "particles", seed, params }`, drawn by the same code in
the browser preview and in the server render. On Linux the two canvases
produce bit-identical particle frames (`tests/compose/parity.test.js`).

```json
{
  "generator": {
    "type": "particles",
    "seed": 7,
    "params": {
      "emitter": "line", "position": { "x": 0.5, "y": -0.05 }, "emitterWidth": 1.3,
      "direction": 180, "spread": 25, "speed": 190, "turbulence": 110,
      "rate": 80, "lifetime": 11, "prewarm": true, "size": 26, "sizeJitter": 0.8
    }
  },
  "blendMode": "normal"
}
```

Code: `src/utils/compose/generators/particles.js` and the folder beside it
(`schedule`, `emitter`, `motion`, `look`, `ramp`, `shapes`, `source`,
`atlas`, `spriteCache`, `draw`, `presets*`, `schema*`).

## The model: nothing is simulated

A particle system usually steps a simulation from frame to frame. This one
keeps **no state at all**. For a frame at clip-local time `t` it works out
which particles exist, and everything about each of them, from the
parameters, the seed and `t` alone:

- Particle *n* of the stream is born at a random moment of its own inside
  slot *n*: `born = (n + u) / rate`, `u` in [0, 1). Every slot of `1 / rate`
  seconds has exactly one birth, without a regular beat.
- A burst's particles are all born at the burst's instant
  (`0`, `burstEvery`, `2 × burstEvery`, …).
- A particle lives `lifetime × (1 − lifetimeJitter × u)` seconds.
- Position, size, turning, colour and opacity are closed-form functions of
  its age (below).

So the particles alive at `t` are found by looking at the slots and bursts
of the last `lifetime` seconds — whatever was drawn before. Frame 100 does
not need frames 0–99, frames can be drawn in any order, and a frame is the
same wherever and whenever it is drawn.

**Randomness.** Whatever differs between particles is
`rand(seed, index, property, burst)` from `compose/random.js`: a stable
number per particle and property. `generator.seed` picks the whole pattern;
another seed gives another, equally valid one.

**Time base.** `t` is `time.t`, the clip's own source time (the keyframe
time base). Therefore:

- **Splitting** a particle clip leaves the right half continuing exactly
  where the left one stops; **trimming** the start does not restart it.
- **Slipping** the clip moves through the same motion.
- Moving the clip on the timeline changes nothing in it.
- Emission starts at clip-local 0. A clip whose start was trimmed outward
  (`sourceIn < 0`) is empty until then — unless `prewarm` is on, which means
  "emission has always been running": the first frame is already full.

## Parameters

Lengths are output pixels, speeds output pixels per second (both scale with
the preview size), angles are degrees clockwise with **0° pointing up**
(90° right, 180° down). The **Key** column says whether the parameter may
be keyframed (`animatable` in the schema); see
[Animating parameters](#animating-parameters) for what that does.

A *variation* (`…Jitter`) of `v` gives each particle between `(1 − v)` and
1 times the value. A *spread* is a full range centred on the value.

### Emitter

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `emitter` | `point` | `point`, `line`, `box`, `circle`, `ring`, `edge` | — | Where on the emitter particles are born: at its centre, along its width, anywhere in its box, anywhere in the ellipse filling the box, on that ellipse's outline, on the box's outline |
| `position` | `{ x: 0.5, y: 0.5 }` | point | yes | Centre of the emitter, in fractions of the frame (may lie outside it) |
| `emitterWidth` | 0.5 | 0 … 4 | yes | Width as a fraction of the frame width |
| `emitterHeight` | 0.5 | 0 … 4 | yes | Height as a fraction of the frame height (not used by `line`) |
| `emitterRotation` | 0 | -3600 … 3600 ° | yes | Turns the emitter shape about its centre |
| `driftX`, `driftY` | 0 | -8000 … 8000 px/s | — | The emitter travels at this velocity and leaves each particle where it was born: a trail |

### Flow

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `rate` | 60 | 0 … 20000 /s | — | Particles born per second, continuously |
| `density` | 1 | 0 … 1 | yes | Share of the scheduled particles that are shown |
| `emitFor` | 0 | 0 … 3600 s | — | Emission (stream and repeating bursts) stops at this clip-local time; 0 = never. Particles already born live on |
| `prewarm` | `false` | boolean | — | Emission has always been running: the field is full from the first frame |
| `burst` | 0 | 0 … 20000 | — | Particles born at once, at clip-local 0 |
| `burstEvery` | 0 | 0 … 3600 s | — | Repeat the burst at this interval (0 = once). Half a second is every beat at 120 BPM |
| `lifetime` | 3 | 0.05 … 120 s | — | Longest life of a particle |
| `lifetimeJitter` | 0.3 | 0 … 1 | — | Variation of the lifetime |
| `maxParticles` | 3000 | 10 … 20000 | — | Hard cap on particles alive, see [The cap](#the-cap-and-performance) |

### Motion

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `speed` | 250 | 0 … 20000 px/s | yes | Launch speed |
| `speedJitter` | 0.3 | 0 … 1 | yes | Variation of the speed |
| `direction` | 0 | -3600 … 3600 ° | yes | Launch direction, 0 = up |
| `spread` | 360 | 0 … 360 ° | yes | Width of the fan around the direction; 360 = everywhere |
| `radial` | 0 | -20000 … 20000 px/s | yes | Extra speed straight away from the emitter's centre (negative: towards it). No effect on a `point` |
| `gravityX`, `gravityY` | 0 | -20000 … 20000 px/s² | yes | Constant acceleration; positive Y is down |
| `drag` | 0 | 0 … 20 /s | yes | Air resistance. Launch speed dies off as `e^(−drag × age)`; a fall settles at `gravity / drag` |
| `swirl` | 0 | -3600 … 3600 °/s | yes | Turns each particle's path about the emitter, clockwise when positive |
| `turbulence` | 0 | 0 … 4000 px | yes | Farthest a particle wanders off its path, per axis |
| `turbulenceScale` | 300 | 10 … 8000 px | — | Size of the eddies: particles closer than this wander together |
| `turbulenceSpeed` | 0.5 | 0 … 20 /s | — | How fast the eddies change |

The path, with `a` the age, `v` the launch velocity, `g` gravity:

```text
coast(a) = (1 − e^(−drag·a)) / drag          → a         without drag
fall(a)  = (a − coast(a)) / drag             → a² / 2    without drag
place(a) = emitter + turn(swirl·a)·(birthPlace + v·coast(a))
                   + drift·born + g·fall(a) + wander(a)
wander(a) = turbulence × (field(place, t) − field(birthPlace, born))
```

`field` is smooth value noise (`noise3` of `random.js`) over the place and
the time, sampled where the particle would be without turbulence. Taking
the difference to its value at birth makes every particle start exactly on
the emitter and drift off smoothly. `drag` is the exact solution of
`dv/dt = g − drag·v` (a test integrates that equation step by step and
compares).

### Sprite and size

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `sprite` | `dot` | `dot`, `circle`, `square`, `star`, `spark`, `ring`, `snowflake`, `heart`, `confetti`, `image` | — | What a particle looks like, see [Sprites](#sprites) |
| `image` | `""` | image | — | With `sprite: "image"`: absolute path of a picture of the project |
| `tint` | 0 | 0 … 1 | yes | With an image: how much of the particle colour replaces the image's own colours (its transparency is kept) |
| `blend` | `add` | `normal`, `add`, `screen` | — | How particles combine with each other, see [Blending](#blending) |
| `size` | 40 | 0 … 4000 px | yes | Longer side of the sprite |
| `sizeJitter` | 0.3 | 0 … 1 | yes | Variation of the size |
| `sizeStart`, `sizeEnd` | 1 | 0 … 20 | yes | Size at birth and at death, as multiples of `size` |
| `sizeCurve` | `linear` | an easing name | — | How the size moves from start to end over the life (`ease-out`, `back-out`, `hold` …) |

### Turning

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `rotation` | 0 | -3600 … 3600 ° | yes | Angle at birth |
| `rotationSpread` | 0 | 0 … 360 ° | yes | Range of angles at birth; 360 = any |
| `spin` | 0 | -7200 … 7200 °/s | yes | Turning speed |
| `spinSpread` | 0 | 0 … 7200 °/s | yes | Range of turning speeds around `spin`; with `spin: 0`, half the particles turn each way |
| `flip` | 0 | 0 … 20 /s | yes | Tumble: the sprite turns about its own horizontal axis this many times a second (each particle between half and one and a half times that), showing its face, its edge and its mirrored back |
| `align` | `false` | boolean | — | The sprite's top points where the particle is heading; `rotation` is added to that |
| `stretch` | 0 | 0 … 2 s | yes | Lengthens the sprite along its travel by `speed × stretch`, like a shutter time; implies `align` |

Round sprites (`dot`, `circle`, `ring`) ignore rotation and spin.

### Colour and opacity

| Parameter | Default | Range | Key | Meaning |
| --------- | ------- | ----- | --- | ------- |
| `colorMode` | `life` | `life`, `random` | — | `life`: every particle goes from `color1` to the last colour over its life. `random`: each keeps one of the colours |
| `colors` | 2 | 1 … 5 | — | How many of the colours are used |
| `color1` … `color5` | white, sky, pink, yellow, green | colour | yes | The colours. An alpha (`#rrggbbaa`) multiplies the opacity |
| `opacity` | 1 | 0 … 1 | yes | Opacity of every particle |
| `fadeIn` | 0.1 | 0 … 1 | yes | Share of the life over which a particle appears |
| `fadeOut` | 0.5 | 0 … 1 | yes | Share of the life over which it disappears |
| `twinkle` | 0 | 0 … 1 | yes | Depth of a pulse in opacity: 1 pulses down to nothing |
| `twinkleSpeed` | 2 | 0 … 60 /s | — | Pulses per second (each particle between half and one and a half times that) |

A colour change over life is drawn in 32 steps.

## Sprites

**Built-in shapes** — `dot` (soft, the default), `circle` (hard), `square`,
`star`, `spark` (a soft streak, top up), `ring`, `snowflake`, `heart`,
`confetti` (a 5 : 3 rectangle) — are drawn white, once, into cached canvases
and tinted with the particle colour.

**Any image of the project**: `sprite: "image"`, `image: "/abs/path.png"`.
The path is an `image` parameter, so `requirements(edl)` lists it and hosts
load it like a still. The picture keeps its own colours and its
transparency; `tint` blends the particle colour over it. It is sized by its
longer side and keeps its proportions. **While the image is missing, not
loaded yet or empty, the layer draws nothing** — it never throws and logs
nothing; the browser preview redraws when the image arrives.

**Crispness.** A sprite is never one bitmap stretched to every size. Each
source is kept as levels, each half the size of the one above, down to one
pixel. Shapes are drawn as vectors at every level of 16 px and more;
smaller levels, and the levels of an image, are averaged from the level
above. A particle is drawn from the smallest level at least 1.22 times its
size on the canvas, so sprites are not stretched up, do not shimmer when
small, and a 480-pixel preview is as bright as the 1920-pixel render
(tested to 3 %). Shapes go up to 2048 px. An image is never drawn from more
than its own resolution: shown larger than it is, it softens. A sprite
that changes colour over its life is drawn from a level of at most 512 px,
one that picks among colours from at most 1024 px (their tinted copies
share one sheet); larger than that on the canvas, they soften too.

**Cache.** Levels and tinted sheets are cached per host environment, at most
16 million pixels and 256 canvases; the least recently used go first. The
cache only saves time: every entry is a pure function of its key.

**Limit.** Sprites are scaled with the canvas's bilinear filter. A sprite
only a few preview pixels across with strokes thinner than a pixel (a small
`snowflake`) looks softer in a small preview than in the scaled-down render;
position, size and brightness still agree.

## Blending

`blend` is how particles combine **with each other** inside their layer:
`normal` (later ones cover earlier ones), `add` (light adds up), `screen`
(adds up without burning out). The clip's own `blendMode` then decides how
the finished layer combines with what is under it. For light — sparks,
embers, fireflies — set both to `add`: `blend: "add"` in the parameters and
`blendMode: "add"` on the clip. Presets say which clip blend suits them.

## Animating parameters

Every number, colour and point may be keyframed
(`generator.params.<name>`, `generator.params.position.x`) except the ones
listed below.

**The rule.** A generator receives parameter *values*, already resolved for
the frame's time — never the curves. So the particle system reads every
keyframed parameter **at the frame being drawn**, and draws that frame as
if the parameter had always had that value. There is no "value at the
particle's birth". A test holds the generator to it: a keyframed frame
equals, byte for byte, the frame of a clip whose parameters are constants
with those values.

All the animatable parameters are ones the picture depends on smoothly, so
a smooth key move is a smooth change on screen — but of the **whole field
at once**:

| Keyframing… | does this |
| ----------- | --------- |
| `position`, `emitterWidth`, `emitterHeight`, `emitterRotation` | moves or reshapes the whole field with the emitter, rigidly. Living particles do not stay behind: no trail (for one, use `driftX` / `driftY`) |
| `speed`, `direction`, `spread`, `radial`, `gravityX/Y`, `drag`, `swirl` | re-aims every particle's whole path: raising gravity bends all the arcs together, raising speed spreads the cloud |
| `turbulence` | scales how far everything wanders |
| `size…`, `rotation…`, `spin…`, `flip`, `stretch`, colours, `tint`, `opacity`, `fadeIn/Out`, `twinkle` | changes the look of all living particles together |
| `density` | thins or fills the field, see below |

**Not animatable**, and why:

- `rate`, `burst`, `burstEvery`, `emitFor`, `lifetime`, `lifetimeJitter`,
  `maxParticles` — they *are* the birth schedule. With only present values
  to go by, a changed rate would re-time every birth and every particle
  would jump. A rate curve could only be honoured by integrating it, which
  needs the curve (see [What the core would have to pass](#what-the-core-would-have-to-pass)).
- `driftX/Y`, `turbulenceSpeed`, `twinkleSpeed` — they multiply a clock, so
  a change of `Δ` would jump by `Δ × time`. `turbulenceScale` rescales the
  whole field about its origin.
- `colors`, selects and switches — not numbers that can blend.

The document format does not forbid keyframing these (any
`generator.params.*` path is accepted); the result is a jumping picture, so
editors should offer only what the schema marks `animatable`.

**How to get what a keyframed rate would give:**

- *Thin out or build up* — keyframe `density`. Each particle has a rank;
  it is shown while `density` is above it, fading over a tenth of the range
  rather than popping. `rate` stays the densest the field gets.
  This thins the whole field at once: lowering it makes living particles
  fade where they are, it does not just stop new ones.
- *Stop emitting, let the rest live out* — `emitFor`.
- *A burst, or one on every beat* — `burst` and `burstEvery`.
- *Fade the layer* — the clip's own fades and `transform.opacity`.

## The cap and performance

`maxParticles` is a hard cap on particles alive. When
`rate × lifetime + burst × (bursts alive at once)` asks for more, rate and
burst size are scaled down together: fewer particles are born, each still
lives its whole life, nothing pops, and the count can never pass the cap
(tested with a rate of 20 000 and bursts of 20 000 every tenth of a
second). The default, 3000, is what stops a mistyped rate from stalling a
render; 20 000 is the most the schema accepts.

Drawing is one `drawImage` per visible particle out of a cached sheet, with
no `save` / `restore`, the opacity set only when it changes, and no
transform at all when sprites do not turn. Fully transparent, zero-sized
and off-frame particles are skipped before anything is drawn. The
arithmetic costs about 0.5 µs per particle; the rest is the canvas filling
pixels, so cost grows with count × sprite area, and turning sprites cost
about twice as much as upright ones.

Median milliseconds per 1920 × 1080 frame (whole `drawFrame`; an empty
frame takes 2–3 ms), particles of 32 px unless noted, measured in the
development container (no GPU):

| Scene | Server canvas: 200 / 1000 / 5000 alive | Chromium: 200 / 1000 / 5000 alive |
| ----- | -------------------------------------- | --------------------------------- |
| `dot`, add | 3.9 / 9.5 / 36 ms | 3.3 / 8.7 / 39 ms (303 / 115 / 26 fps) |
| `dot`, normal | 3.7 / 7.8 / 26 ms | 2.4 / 6.7 / 29 ms (417 / 149 / 34 fps) |
| `dot`, add, colour over life, turbulence | 3.4 / 8.3 / 35 ms | 2.7 / 8.0 / 38 ms (370 / 125 / 27 fps) |
| `star`, spinning, add | 4.9 / 16 / 72 ms | 6.0 / 18 / 97 ms (167 / 54 / 10 fps) |
| `confetti`, spin and tumble, normal | 4.2 / 12 / 51 ms | 4.1 / 13 / 62 ms (244 / 79 / 16 fps) |
| `spark`, aligned and stretched, add | 3.1 / 7.3 / 30 ms | 2.7 / 7.5 / 34 ms (370 / 133 / 29 fps) |
| image 256 px, upright, normal | 3.0 / 6.8 / 26 ms | 2.4 / 7.8 / 34 ms (417 / 128 / 29 fps) |
| image 256 px, spinning, normal | 4.8 / 17 / 75 ms | 5.0 / 19 / 94 ms (200 / 53 / 11 fps) |
| image, tinted over life, spinning | 5.4 / 19 / 80 ms | 5.8 / 19 / 97 ms (172 / 52 / 10 fps) |
| `dot` of 8 px, add | 4.0 / 6.4 / 18 ms | 2.2 / 4.4 / 18 ms (455 / 227 / 56 fps) |
| `dot` of 96 px, add | 7.7 / 32 / 166 ms | 7.4 / 32 / 148 ms (135 / 31 / 7 fps) |

Chromium was headless with a software rasteriser, so its numbers are a
floor for a real browser, not a measurement of one. In round figures: a
thousand particles cost 5–20 ms a frame, five thousand 20–100 ms.

Every preset keeps under 900 alive and takes 3–7 ms a frame on the server
canvas, except `haze`, whose fifty puffs of 800 px take about 50 ms: large
sprites are paid for by the pixel. A keyframed colour re-tints the sprite
sheets every frame, which costs under a millisecond for small sprites and
30–40 ms for sprites larger than about 200 px on the canvas.

## Presets

`PRESETS`, exported by `src/utils/compose/generators/particles.js`, is
plain data: `{ id, name, description, params, blendMode? }`. `params` holds
only what differs from the defaults, so
`insertGenerator(edl, { type: 'particles', params: preset.params }, { clip: { blendMode: preset.blendMode } })`
is a finished layer. Sizes and speeds suit a 1920 × 1080 frame; emitters
are in fractions of the frame and fit any aspect ratio.

| `id` | Name | What it is | Clip blend |
| ---- | ---- | ---------- | ---------- |
| `snow` | Snow | Soft flakes of many sizes falling and drifting sideways | — |
| `rain` | Rain | Fast slanted streaks | — |
| `dust` | Dust | Fine motes hanging in the light, slowly wandering and glinting | `add` |
| `haze` | Haze | Large soft puffs rolling slowly, like thin smoke or fog | — |
| `fireflies` | Fireflies | A few glowing lights meandering and pulsing | `add` |
| `sparks` | Sparks | A spray of hot streaks that arc under gravity and burn out | `add` |
| `embers` | Embers | Glowing specks rising from below, cooling from yellow to red | `add` |
| `starfield` | Starfield | A still sky of twinkling stars, drifting very slowly | `add` |
| `pulse` | Beat burst | A ring of stars thrown out twice a second — set `burstEvery` to the beat | `add` |
| `confetti` | Confetti burst | One burst of tumbling paper that shoots up and flutters down | — |
| `bubbles` | Bubbles | Rings of many sizes wobbling upwards | — |
| `hearts` | Hearts | Hearts floating up and swaying, growing as they rise | — |
| `images` | Falling images | Any picture as the particle, falling and turning. Set `image`; nothing is drawn until then | — |

## What the core would have to pass

Two things particle systems often do are out of reach while a generator
sees only the present value of its parameters: an emitter that leaves a
trail along a **keyframed** path, and a **keyframed** emission rate. Both
need a parameter's value at each particle's *birth*. If the compositor
handed generators a way to read their own parameters at another clip-local
time (the clip's `generator.params.*` keys, or a `paramsAt(t)` function),
the schedule could integrate the rate curve and each particle could take
the emitter's place at its birth, still without any state. Until then:
`driftX` / `driftY` for straight trails, `density`, `emitFor` and bursts
for the flow.

## Tests

```bash
node --test src/utils/compose/generators/particles/*.test.js
CHROMIUM_PATH=/path/to/chromium node --test tests/compose/*.test.js
```

- `schedule.test.js`, `motion.test.js`, `look.test.js` — the closed forms:
  births, counts, the cap, emitter shapes, gravity and drag against a
  simulation, turbulence, sizes, fades, colours.
- `stateless.test.js` — a frame twice, after other frames, in reverse
  order, on a fresh canvas; a split, a trim, a slip, a move, `prewarm`.
- `pixels.test.js` — where emitters put particles, where a burst is after
  a time, fades, sizes and colours at chosen ages, how many are drawn.
- `sprites.test.js` — images (own colours, tint, rotation, missing, late),
  every built-in sprite, crispness, preview against render, the cache.
- `keyframes.test.js` — the rule above; `presets.test.js` — every preset.
- `tests/compose/cases/particles.js` — six documents in the cross-canvas
  parity test and the resolution test.
