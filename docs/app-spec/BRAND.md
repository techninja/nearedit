# Brand Kits — a Look You Set Once and Inherit Everywhere

People who publish regularly want every video to look like theirs without
rebuilding it each time: their colours and fonts, their logo, the way a
name appears under a speaker, the bumper at the start, the wipe between
segments, the sound. A **brand kit** holds all of that in one place.
Projects inherit from it; what it puts on a timeline can be brought up to
date when it changes; and the director uses it by default, so generated
titles, demos and scores come out on brand without being asked.

```text
kit  =  tokens (colours, fonts, logos, spacing, motion, sound)
      + elements (designs built from tokens, with slots to fill in)
      + defaults (what the director and the tools reach for)

kit ◄─ extends ─ kit ◄─ chosen by ─ project ─► element clips on the timeline
                                                (one clip each; inside is the
                                                 brand's, outside is yours)
```

## Three ideas

**Tokens, not values.** A design never says `#4f46e5` or `Inter 900`; it
says `{color.primary}` and `{font.heading}`. Changing a token changes every
design that uses it — in this kit and in every kit that extends it.

**Instances, not copies and not live links.** A template that is copied
never changes again; a timeline that links to a kit can no longer be drawn
without it. An element clip is in between: it carries its design with the
tokens already filled in — so the document draws anywhere, with no kit at
hand — and remembers which element of which kit, at which revision, it came
from. When the kit has moved on the clip is *out of date*, and **Update to
brand** replaces its design while keeping what was filled in. The same
model as [web clips](./WEBCLIP.md) and [music clips](./MUSIC.md).

**Inside is the brand's, outside is yours.** An element is one clip on the
timeline. Its inside — layers, colours, type, motion — comes from the kit
and is replaced on update. Everything about the clip itself — where it
sits, how long it lasts, its fades, its transform, effects and keyframes —
is the editor's and is never touched by an update.

## A kit

A folder: `kit.json`, and beside it the files it names (logos, fonts,
stings). It can be zipped, shared, kept in version control.

```json
{ "id": "acme", "name": "Acme", "extends": "builtin:clean",
  "tokens": {
    "color": { "background": "#0b1020", "surface": "#141a33", "primary": "#4f46e5",
               "accent": "#f59e0b", "text": "#ffffff", "muted": "#a5b4fc" },
    "font":  { "heading": { "family": "Acme Sans", "weight": 700 },
               "body":    { "family": "Inter", "weight": 400 } },
    "logo":  { "main": "logo.png", "mark": "mark.png" },
    "shape": { "radius": 1.2, "stroke": 0.4 },
    "space": { "margin": 6, "gap": 1.5 },
    "motion": { "enter": "slide-up", "by": "word", "ease": "ease-out", "speed": 1 },
    "sound": { "style": "lofi", "key": "A", "scale": "minor" } },
  "fonts": [{ "family": "Acme Sans", "weight": 700, "file": "fonts/AcmeSans-Bold.woff2" }],
  "elements": { "lower-third": { "…": "below" } },
  "defaults": { "captions": "caption", "intro": "intro", "outro": "outro", "bug": "bug" } }
```

- **`extends`** names another kit: a built-in (`builtin:clean`), or a kit of
  the library by id. Tokens are merged key by key, the child winning;
  elements and defaults are inherited and replaced by name. Chains may be
  five long; a loop is an error. `resolveKit(chain)` gives the **effective
  kit**, and `kitKey(effective)` its revision: 20 hex digits of the SHA-256
  of everything that affects a picture or a sound.
- **Lengths are in units**: 1 unit is one hundredth of the frame's shorter
  side. A margin of 6 is 64.8 pixels at 1920 × 1080 and the same share of
  a vertical or square frame, so one design fits every format.
- **Colours** have roles, not names. `text` must be readable on
  `background`, and on `primary` or `accent` a design asks for
  `{color.onPrimary}` / `{color.onAccent}`, which are derived (black or
  white, whichever reads) unless the kit sets them. `{color.surface}cc`
  adds transparency to a token.
- **Fonts** are the bundled families or files the kit brings (`.woff2`,
  `.woff`, `.ttf`, `.otf`). A font token may also say `italic`,
  `tracking`, `lineHeight`, `upper` and `scale` (a family that runs small
  is drawn larger everywhere).
- **Logos** are `png`, `jpg`, `webp` or `gif` — no SVG. A kit without one
  draws its `logo.initials` in a mark made from its colours.
- `TOKEN_SCHEMA` (`src/utils/brand/tokenSchema.js`) is every token as
  data — type, range, label, group — and an editor is generated from it.
- A kit that leaves something out inherits it; the root of every chain is
  a built-in kit, so an effective kit is always complete.

**Built-in kits** ship with NearEdit and are ordinary kits: `clean`,
`bold`, `documentary`, `playful`. Each defines every standard element.

## Elements

A design with blanks. The standard set every complete kit has:

| Element | Kind | Slots | What it is |
| ------- | ---- | ----- | ---------- |
| `lower-third` | overlay | `name`, `role` | A name and what the person is, low in the frame |
| `title` | overlay | `title`, `subtitle` | A heading over the picture |
| `caption` | overlay | `text` | One line of speech or description; `add_captions` uses it |
| `quote` | overlay | `text`, `by` | A pulled quote |
| `chapter` | segment | `title`, `number` | A card that opens a section |
| `intro` | segment | `title`, `subtitle` | The opening bumper, with the logo |
| `outro` | segment | `title`, `text` | The end card: thanks, where to go next |
| `bug` | overlay | — | The logo in a corner for the whole piece |
| `stinger` | transition | — | Covers the frame for a moment so a cut can hide under it: the logo wipe |

`overlay` sits over other pictures; `segment` fills the frame and takes its
own time; `transition` is centred on a cut and says when the frame is
covered. A kit may define more.

An element is `label`, `kind`, `duration` (and `minDuration`), `slots`,
`groups` and `layers` from back to front — text, shapes, images and
generators — written with token references (`{color.primary}`), slot
references (`{slot.name}`) and unit lengths.

```json
{ "label": "Lower third", "kind": "overlay", "duration": 5, "minDuration": 1.5,
  "slots": { "name": { "label": "Name" }, "role": { "label": "Role", "optional": true } },
  "groups": { "block": { "at": "bottom-left", "align": "left", "gap": 0.7, "pad": [3.2, 2] } },
  "layers": [
    { "id": "plate", "type": "shape", "around": "block", "fill": "{color.surface}eb",
      "radius": "{shape.radius}", "enter": { "motion": "wipe", "duration": 0.45 }, "exit": "fade" },
    { "id": "name", "type": "text", "in": "block", "text": "{slot.name}", "font": "{font.heading}",
      "size": 5.2, "color": "{color.text}", "lines": 2,
      "enter": { "motion": "{motion.enter}", "delay": 0.2 }, "exit": "fade" },
    { "id": "role", "type": "text", "in": "block", "when": "{slot.role}", "text": "{slot.role}",
      "font": "{font.body}", "size": 3.2, "color": "{color.muted}" } ],
  "formats": { "tall": { "groups": { "block": { "y": -14 } }, "layers": { "name": { "size": 6.2 } } } } }
```

- **Placement.** `in: <group>` stacks a layer in a group; `at` (+ `inside`:
  `safe`, `frame` or another layer) anchors it; `around: <group or layer>`
  with `pad` makes a plate that follows what it sits behind; `beside` with
  `side`, `gap`, `thickness`, `span` makes rules and accents.
- **Conditions.** `when` / `unless` on a slot or a token: a layer is left
  out when a slot is empty.
- **Motion.** `enter` and `exit`, each a name or `{ motion, delay,
  duration, by, ease, stagger, travel, angle }`; motions are `none`,
  `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`,
  `wipe`, `type`, `blur`. Entrances are **timed from the start and exits
  from the end**, so a lower third held for two seconds or for twenty
  arrives and leaves the same way; an element too short for its motions
  shortens them in proportion, and the kit's `motion.speed` scales all.
- **Formats.** `formats.wide`, `.tall`, `.square` override groups and
  layers for that shape of frame.
- **Text fits.** Wrapping that respects hyphens, shrinking down to a
  `minSize`, balanced lines, and an ellipsis as the last resort; a stack
  too tall for its place shrinks as a whole. Drawn text is cut at 600
  characters.
- **Transitions.** `cover` says over which part of its length a stinger
  hides the whole frame; `coverTime(design, duration)` gives the instant
  to put the cut under.

The language is deliberately small; its reference is the module that reads
it, `src/utils/brand/element/index.js`. A broken or hostile design never
throws: it draws nothing and warns.

## Element clips

```json
{ "timelineStart": 12, "timelineEnd": 16, "fadeOut": 0.2,
  "element": { "kit": { "id": "acme", "key": "5d0c…" }, "id": "lower-third",
               "slots": { "name": "Ada Lovelace", "role": "Mathematician" },
               "design": { "…": "the element, tokens filled in" } } }
```

- The clip draws by **expanding** its design for its own length and the
  frame it is drawn in: `expandElement(design, slots, { duration, frame,
  measure })` → ordinary layers, which the compositor draws onto a surface
  and then treats as the clip's picture (transform, effects, blend, fades).
  Pure and isomorphic; text is measured with the same fonts on both sides,
  so the preview and the render agree.
- The same clip in a vertical adaptation lays itself out for a vertical
  frame. Nothing has to be restyled to reformat.
- Its source is unbounded, like a title's: it may last as long as it is
  made to.
- Pieces of one element that touch on a track — an element that was
  split — play as one: one entrance, one exit.
- **Out of date**: `element.kit.key` differs from the key of the project's
  effective kit (`staleElements` says `outdated`), or the element is gone
  from it (`missing`). `restyle(edl, kit)` replaces the designs of every
  element clip, or of the clips named, keeping slots and everything
  outside. It goes by the element's id whatever kit the clip came from —
  which is how a timeline changes brand. `detachElement` turns one into
  ordinary clips on tracks, ending its tie to the kit; the pieces keep the
  clip's position, size and opacity, not its fades, effects or keyframes.
- A document lists the fonts it needs that are not bundled:
  `fonts: [{ family, weight, style, file }]` (kept in step by the
  operations; absent when empty). Both hosts load them before drawing; a
  file that is missing draws in the fallback family with a warning.
- Logo and font files are named by path like any media, so a kit's files
  must be reachable as media — see [BRAND-API.md](./BRAND-API.md).

Operations (`#utils/edl/index.js`): `insertElement(edl, kit, elementId,
slots, { time, duration, trackId, ripple, label })`, `updateElementSlots`,
`restyle`, `detachElement`, `elementClips`, `staleElements(edl, kit)`,
`syncFonts`. Segments are inserted with a ripple by default; a `stinger`
is centred on the nearest cut. `updateClip` cannot write `element`.

Drawing an element costs little once it has arrived: at 1920 × 1080 on
the server, 0.1–0.6 ms a frame at rest for most, up to 8 ms for the two
with soft shadows over gradients, and 2–18 ms while entering.

## Where kits live

- **Built in**: in the code, `src/utils/brand/kits/`.
- **The library**: `<data>/kits/<id>/` — a person's or a team's kits,
  listed by `GET /kits`.
- **In a project**: `<project>/.nearedit/kit/` — a kit that travels with
  the project, usually one that extends a library kit and changes a little.

A project names its kit (`project.kit`: an id, or `project` for its own);
an adaptation may name another. With none, `builtin:clean`.

## What uses the kit

- **The Create tab** lists the kit's elements; adding one asks only for
  its slots.
- **The director**: motion pieces, site demos, captions and scores take
  their theme, type, captions and musical style from the kit unless told
  otherwise, and its plans can name elements — "lower third: Ada, CEO, at
  0:12" — instead of inventing a look. A brand pass adds the intro, the
  outro and the bug, and names the speakers.
- **The command line**: `nearedit restyle timeline.json --kit <folder>`
  brings a document up to date with a kit — one timeline or a folder of
  them.

## Limits

- An element's layers are text, shapes, stills and generators: no footage
  inside an element yet, and no sound (a kit's sting is placed as a clip of
  its own beside the element).
- Elements cannot contain elements.
- Kits are edited as tokens in the editor; a new element is written as
  JSON.
