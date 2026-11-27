# The Director's Motion Piece

`motion_piece` builds a title sequence out of nothing but generated layers:
animated backgrounds, particles, shapes and titles. It needs no media file.
From a few lines of text it returns an ordinary `DirectorResult` fragment
([API.md § Director](./API.md#director)) that merges with
`applyDirectorResult` like every other director result — and every clip in
it is a plain generator or title ([COMPOSITOR.md](./COMPOSITOR.md)) that can
be edited afterwards.

It follows the director's one design rule ([DIRECTOR.md](./DIRECTOR.md)): a
plan says *what*; deterministic code does all placement, timing and styling.

```text
brief ─► motion plan ─► complete ─► build ─► DirectorResult
          ▲       ▲        ▲
   brief's lines  LLM      theme + seed fill every open choice
   (default)   (optional)  and replace unknown names
```

## The action

| Field | Value |
| ----- | ----- |
| `action` | `motion_piece` |
| LLM | optional (`params.useLlm`) |
| Modes | all; default `replace` |
| `prompt` | The brief. Without the LLM: one line per scene. With it: a description of the piece |

| Param | Values | Meaning |
| ----- | ------ | ------- |
| `theme` | `auto`, or a [theme](#themes) | `auto` lets the seed choose |
| `duration` | 0–600 s, default 0 | Target length. 0 = every scene stays as long as its text takes to read; in mode `range` 0 fills the range |
| `pacing` | `slow`, `medium`, `fast` | Reading speed and length of transitions |
| `seed` | 1–99, default 1 | The same brief, parameters and seed always give the same piece; another seed gives another take |
| `particles` | `auto`, `none`, or a particle preset | Anything but `auto` is used for every scene |
| `useLlm` | toggle, default off | Let the language model write the scenes |

An empty brief is answered with `422` and `fields.prompt` before a job
starts (`checkBrief`, called by `request.js` as scripts are checked). The
frame size and rate come from the adaptation (or the posted `edl`), so a
piece is laid out for the timeline it is going into.

```json
{
  "action": "motion_piece",
  "mode": "replace",
  "prompt": "Made from nothing | no footage, only layers\nEvery number can move\nStart here",
  "params": { "theme": "midnight", "seed": 3 }
}
```

## Motion plan

The compact JSON a language model returns, and the same shape the brief
reader produces. Schema: `src/utils/director/motion/planSchema.js`.

```json
{
  "theme": "midnight",
  "scenes": [
    { "title": "Made from nothing", "subtitle": "no footage, no images, only layers",
      "background": "spotlight", "particles": "dust", "accent": "rule",
      "textAnimation": "slide-up", "by": "char" },
    { "title": "Every number can move", "background": "gradient", "transition": "wipe" },
    { "title": "Start here", "look": "cinematic", "transition": "fade", "duration": 4 }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `scenes[]` | Required, 1–40. Shown one after another |
| `title` | Required. Up to 120 characters |
| `subtitle` | A second, smaller line. Up to 200 characters |
| `background` | A [background recipe](#backgrounds) |
| `particles` | `none` or a particle preset id |
| `accent` | An [accent](#accents) |
| `look` | `none` or the name of an effect preset |
| `textAnimation`, `by` | How the title arrives, and the piece it is staggered over |
| `transition` | How the scene arrives |
| `duration` | Seconds the scene stays, up to 60. Left out, reading time decides |
| `theme` (top level) | A theme id |
| `align` (top level) | `center` or `left` |

Only `title` is required. A plan never holds clips, times, sizes,
positions, colours, fonts or keyframes. The schema checks the *shape*; names
are plain strings on purpose, because an unknown name is no reason to reject
a plan (see [Completing a plan](#completing-a-plan)).

## Vocabularies

`src/utils/director/motion/vocab.js`. Whatever mirrors the compositor is
**read from its catalog** (`#utils/compose/index.js`), so a preset, text
animation, pattern or wipe shape added there is usable in a plan — and
offered to the LLM and in the form — at once.

| Field | Names | Source |
| ----- | ----- | ------ |
| `background` | `solid`, `gradient`, `spotlight`, `noise`, then every pattern kind (`stripes`, `checker`, `dots`, `grid`) | Own recipes; pattern kinds from the `pattern` generator's schema |
| `particles` | `none`, then every particle preset that needs no image (`snow`, `rain`, `dust`, `haze`, `fireflies`, `sparks`, `embers`, `starfield`, `pulse`, `confetti`, `bubbles`, `hearts`) | `GENERATORS` → `particles.presets` |
| `accent` | `none`, `rule`, `frame`, `ring`, `burst` | Own recipes |
| `look` | `none`, then every effect preset (`cinematic`, `dream`, `vhs`, `noir`, `warm`, `cool`, `spotlight`, `vintage`, `neon`, `glitch`) | `EFFECT_PRESETS` |
| `textAnimation` | `none`, `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `blur`, `typewriter` | `TEXT_ANIMATIONS` |
| `by` | `block`, `line`, `word`, `char` | `TEXT_UNITS` |
| `transition` | `cut`, `fade`, then every wipe shape: `wipe` (the straight one), `radial`, `iris`, `clock` | `EFFECTS` → `wipe.params.shape` |

Theme fonts come from `FONT_FAMILIES` (bundled families only).

### Backgrounds

Each recipe is one generator in three colours of the theme (edge, middle,
light) with a slow move keyed over the whole clip, so nothing stands still
(`motion/backgrounds.js`, `patterns.js`).

| Recipe | Generator | Move |
| ------ | --------- | ---- |
| `solid` | `solid` | `color` drifts from the middle colour toward the light or the edge colour |
| `gradient` | `gradient`, linear, three stops | `angle` turns about 9° per second (18–70° in all) |
| `spotlight` | `gradient`, radial, light in the middle | `center` wanders, `size` grows from 0.8 to 1.05 |
| `noise` | `noise`, three colours, large features | Evolves by itself; `balance` is keyed from dark to light |
| pattern kinds | `pattern` in two close colours | `offsetX` / `offsetY` drift |

### Accents

One `shape` generator per scene, moved by keyframes (`motion/accents.js`,
`ornaments.js`).

| Accent | What |
| ------ | ---- |
| `rule` | A line that draws itself between title and subtitle (under a lone title): from its middle in centred layouts, from the margin in left ones |
| `frame` | An outline 5.5% inside the edges of the picture that settles inward |
| `ring` | A thin circle centred on a corner — a quarter shows — growing slowly |
| `burst` | A 14-pointed star in the backdrop's light colour, turning behind the words |

### Looks

A look is an effect preset stacked on the scene's **background clip** — one
preset on one layer, in front of nothing but the background. A preset made
of `glow` alone needs something to glow and goes on the **title** instead.
No theme uses a look with `blur` or `glow` by default; they stay available
to a plan.

## Themes

`src/utils/director/motion/themes.js` (+ `themesNight.js`, `themesDay.js`).
A theme is data: colours, a pairing of bundled fonts, and for every choice a
scene makes, the options that suit it.

| Theme | Type | Ground | Backgrounds | Particles | Look |
| ----- | ---- | ------ | ----------- | --------- | ---- |
| `midnight` | Bebas Neue + JetBrains Mono | Deep indigo | spotlight, gradient, noise | dust, starfield | none |
| `sunrise` | Playfair Display italic + Inter | Plum to orange | gradient, spotlight, noise | embers, dust | none |
| `paper` | Playfair Display black + Inter | Warm paper, dark ink | dots, spotlight, grid, solid | none | none |
| `neon` | Inter bold + JetBrains Mono, magenta halo | Near black | grid, spotlight, dots | starfield, none | none |
| `forest` | Caveat + Inter | Greens and teal | noise, spotlight, gradient | fireflies, dust | none |
| `blueprint` | JetBrains Mono | Navy | grid, dots, spotlight | none | none |
| `pop` | Inter black | Flat saturated colour | stripes, solid, dots, checker | confetti, none | none |
| `noir` | Playfair Display black + Inter | Greys | spotlight, noise, gradient | dust, none | cinematic |

A theme holds `ink`, `sub` and `accent` colours; `backdrops` (colour ways of
three colours each, used scene after scene); `title` and `subtitle` fonts
with their largest size as a share of the frame's shorter side; `shadow` (a
soft shadow in the backdrop's deepest colour) or `halo` (a coloured light
around the text — a text shadow, not a glow effect); and the lists
`backgrounds`, `particles`, `animations` (`[textAnimation, by]`), `accents`,
`transitions`, and one `look`. The first background is the theme's
signature and opens every piece.

Readability is a property of the data: `ink` and `sub` have a contrast
ratio of at least 4.5 against every colour of every backdrop (tested).
Adding a theme is adding an entry; the tests then hold it to the same rules.

## Without a model

`motion/brief.js`. Every non-empty line of the brief is a scene. What
follows ` | `, an em dash, ` – ` or ` -- ` is the subtitle. Bullets,
numbering and Markdown heading marks in front are dropped. A brief that is
one long line is split at its sentences, with a note. At most 40 scenes;
titles over 120 and subtitles over 200 characters are cut at a word, with a
note.

```text
Made from nothing | no footage, only layers
- Every number can move
3. Start here — whenever you like
```

Everything else comes from the theme and the seed.

## Completing a plan

`motion/complete.js` makes every choice a plan left open, the same way for
both planners, and returns the complete plan (it is the result's `plan`).

| Choice | Decided |
| ------ | ------- |
| Theme | `params.theme`, else the plan's `theme`, else by seed: whole-number seeds walk through the themes in order (seed 1 is the first), so the next seed always gives another theme; any other seed is hashed |
| Text animation, transition, accent, particles, alignment | Once per piece, by seed, from the theme's lists — a piece keeps one motion language. Alignment is centred two times out of three |
| Background | The theme's signature for scene 1, then the theme's other backgrounds in the seed's order |
| First scene's transition | `fade` — a piece opens from black |
| Look | The theme's |
| `by` | The unit the theme pairs with the animation, else `word` (`char` for `typewriter`) |

A name no vocabulary knows is replaced by what the theme and seed would
have chosen and reported: `Scene 2: unknown background “lava” — gradient is
used instead.` `params.particles` other than `auto` overrides every scene.

## With a model

`params.useLlm` asks the configured LLM for the plan
(`prompts/motion.js`). The system prompt lists every vocabulary with the
catalog's own one-line descriptions, shows the example plan, and says that
every field but `title` may be left out. The user prompt carries the format
(`Main Edit: 1080x1920 (9:16, portrait), 30 fps.`), the target length with
a suggested number of scenes, the pacing, a theme or particle choice the
editor fixed, and the brief.

**From reply to plan** (`motion/parse.js`, `normalize.js`, `request.js`) —
the procedure edit plans go through: reasoning blocks are stripped; JSON is
taken from a code fence or the first balanced object; `jsonrepair` fixes
what `JSON.parse` rejects; harmless deviations are normalised (synonymous
keys such as `slides`, `heading`, `caption`, `bg`, `animation`; a bare list
of scenes or of titles; a `{ "plan": … }` wrapper; `"4s"` as 4; names
written with capitals, spaces or underscores; `false` as `none`); then the
plan is validated with ajv. If it is invalid the model is asked **once**
more with the errors listed. If the retry is still invalid, the scenes
whose title is usable are kept without their unusable fields, with notes;
if none is, the request fails.

The LLM is *optional* here: when it cannot be reached or returns nothing
usable, the lines of the brief are used as scenes instead and the first
note says so. The request is never refused for a missing LLM.

## Building

`motion/build.js` turns a complete plan into the fragment.

### Rows

A motion fragment always lists six video tracks, front to back:

| Row | Name | Holds |
| --- | ---- | ----- |
| video 0 | Titles | One title clip per scene |
| video 1 | Text | Subtitles |
| video 2 | Particles | Particle fields and bursts |
| video 3 | Accents | Rules, frames, rings, bursts |
| video 4 | Background A | Backgrounds of the even scenes (2nd, 4th …) |
| video 5 | Background B | Backgrounds of the odd scenes |

As with every result, names apply to tracks the merge creates (and to all
rows in `replace` mode). There are no audio clips.

### Timing

Everything is placed in whole frames of the target frame rate; every clip's
source window starts at 0, so a keyframe's `t` is the time since its clip
began (`motion/timing.js`, `shots.js`).

A scene lasts `base + perWord × words` seconds (title and subtitle), kept
between `min` and `max`; a plan's `duration` replaces that.

| Pacing | `base` | `perWord` | `min` – `max` | Transition |
| ------ | ------ | --------- | ------------- | ---------- |
| `slow` | 3.2 s | 0.42 s | 3.2 – 12 s | 0.8 s |
| `medium` | 2.4 s | 0.30 s | 2.4 – 9 s | 0.6 s |
| `fast` | 1.5 s | 0.22 s | 1.5 – 6 s | 0.4 s |

With a target `duration`, all scenes are scaled by the same factor and the
frames are shared out (largest remainders first) so the piece ends
**exactly** on the target. No scene gets under 1 second (or 8 frames); when
that makes the piece longer than asked, or scenes were stretched or
squeezed a lot, a note says so.

A fade or wipe takes the pacing's transition time, never more than 30% of
the shorter of its two scenes; a cut takes none. The last scene fades to
nothing over up to half a second. Within a scene:

- the title starts 60% into the transition (0.1 s after a cut); its
  entrance takes up to 1.5 × the transition time, never over 35% of the
  time the words are up. Pieces (`by`) are staggered so the whole entrance
  fits that time however long the text is;
- the subtitle follows when 70% of the title has arrived, in the theme's
  subtitle animation; a rule is drawn from half-way through the title's
  entrance; other accents come in with the title;
- words and accent leave with a fade of up to 0.4 s that ends exactly where
  the next scene begins. Before a cut they simply stay up to the cut.

One marker per scene carries its title.

### Text

`motion/typeset.js`, `layout.js`. Text is measured on the server canvas
with the bundled fonts — the widths the compositor draws with — and fitted
to the **target resolution**, whatever its shape:

- a margin of 8% of the width on each side (11.5% inside a `frame`
  accent, so the words keep clear of the outline); left-aligned text in a
  wide frame uses 62% of the width;
- the title starts at the theme's size (a share of the frame's shorter
  side, smaller for long titles) and shrinks in steps of 6% until it fits
  in three lines (four in a tall frame), within 46% of the height (40%),
  with no word broken; never below 5% of the shorter side;
- lines are then evened out: the narrowest wrap width that keeps the line
  count is stored as `text.maxWidth`, so the compositor wraps exactly as
  measured and the text re-flows if it is edited;
- the subtitle is sized the same way (at most 62% of the title's size, at
  least 2.6% of the shorter side);
- title and subtitle are stacked as one group just above the middle of the
  frame, centred or against the left margin.

Text that cannot fit at a readable size (a 120-character word) is still
wrapped inside the frame, and a note asks for it to be shortened.

### Particles

`motion/particles.js`. A scene's particle preset is used as the catalog
defines it, with its blend mode. Lengths (every parameter whose schema unit
starts with `px`) are scaled by `shorter side / 1080`, the size presets are
tuned for. Neighbouring scenes with the same preset share **one clip**, so
the field runs on through the transitions; a preset that is a single burst
(`rate: 0`, no `burstEvery`) goes off anew as each title arrives.

### Transitions

`motion/transitions.js`. Backgrounds alternate between the two rows and
overlap for the length of the transition, so there is never a cross-fade
pair on one track. Whichever of the two clips is **in front** carries the
transition:

- a scene on row A arrives over the one before it: its clip has `fadeIn`,
  or a `wipe` effect (`wipeIn`) whose `progress` is keyed 0 → 1;
- a scene on row B is uncovered by the one before it: that clip has
  `fadeOut`, or an inverted `wipe` (`wipeOut`) keyed 0 → 1 over its last
  frames — which looks the same.

Wipes have a feather of 12% of the shorter side; a straight wipe's direction
and an iris's turn (box or diamond) come from the seed.

### Cost

Measured here at 1920×1080 (and at half size, a typical preview) over whole
pieces of five scenes, on average per frame: 13 ms for `paper` and
`blueprint`, 30–53 ms for the themes with particles and shadowed text
(`midnight` the dearest), 4–11 ms at half size; `noir`, the one theme with
a look, 85 ms and 27 ms. A scene is two to
five layers, one more while a transition runs.

## The result

A `DirectorResult` as in API.md, with:

- `tracks`: the six rows (plus, in `replace` mode, an empty entry for every
  other track of the posted document);
- `markers`: one per scene;
- `plan`: the complete plan — every choice that was made — each scene with
  the `duration` it was given;
- `summary`: `Motion piece “Midnight”: 3 scenes, 11.1s — spotlight, gradient
  and noise backgrounds, dust`;
- `notes`: where the scenes came from, the theme and why, the frame it was
  laid out for, every replaced name, and anything about length or fit.

## Limits

- No sound: the fragment has no audio clips. Lay music under it by hand.
- The job reads the project's media first, like every director job,
  although this action uses none of it.
- Particle presets that add light (`dust`, `starfield`, `fireflies` …) do
  not show on the light `paper` grounds; that theme has none by default.
- `look` presets that blur or glow (`dream`, `neon`) cost 50–80 ms per
  1080p frame; no theme chooses them by itself.

## Code map

| Path | What |
| ---- | ---- |
| `src/utils/director/actionsMotion.js` | The action schema |
| `src/utils/director/motion/` | Isomorphic and pure: vocabularies, themes, colour arithmetic, plan schema |
| `src/api/director/actions/motion.js` | The action |
| `src/api/director/prompts/motion.js` | The LLM prompt |
| `src/api/director/motion/brief.js`, `complete.js` | Brief → scenes; completing a plan |
| `src/api/director/motion/normalize.js`, `parse.js`, `request.js` | LLM reply → plan, with one retry |
| `src/api/director/motion/timing.js`, `shots.js` | Scene lengths; the schedule |
| `src/api/director/motion/measure.js`, `typeset.js`, `layout.js` | Text measurement, fitting, placement |
| `src/api/director/motion/backgrounds.js`, `patterns.js`, `accents.js`, `ornaments.js`, `particles.js`, `transitions.js`, `titles.js` | The layers |
| `src/api/director/motion/backdrop.js`, `words.js`, `scene.js`, `build.js` | Clips of a scene; the fragment |

Tests sit beside the code (`node --test`): the vocabularies against the
catalog, every theme's contrast, the brief reader, completion by seed, reply
parsing and salvage, timing, every theme at 16:9, 9:16 and 1:1 through the
fragment checker and `validateEdl`, every generator, effect, parameter and
keyframe path against the catalog, transitions, text measured inside the
frame, the action in every merge mode, the LLM path against the fake server
and the route over HTTP.
