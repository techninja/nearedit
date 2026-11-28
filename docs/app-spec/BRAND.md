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
  `background`, and on `primary` a design asks for `{color.onPrimary}`,
  which is derived (black or white, whichever reads) unless the kit sets it.
- **Fonts** are the bundled families or files the kit brings (`.woff2`,
  `.woff`, `.ttf`, `.otf`).
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

An element is `label`, `kind`, `duration` (and `minDuration`), `slots`, and
`layers` from back to front — text, shapes, images and generators —
written with token references (`{color.primary}`), slot references
(`{slot.name}`) and unit lengths. A layer is placed by an anchor in the
frame (inside the safe margins), may size itself to another layer (a plate
that fits around the name it sits behind), may be left out when a slot is
empty, and enters and leaves with a named motion — **timed from the start
and from the end**, so a lower third held for two seconds or for twenty
arrives and leaves the same way. `formats` adjusts layers for tall and
square frames. The language is deliberately small; its reference is the
module that reads it, `src/utils/brand/element/`.

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
- **Out of date**: `element.kit.key` differs from the key of the project's
  effective kit (or the element is gone from it). `restyle(edl, kit)`
  replaces the designs of every element clip, or of the clips named,
  keeping slots and everything outside; `detachElement` turns one into
  ordinary clips on tracks, ending its tie to the kit.
- A document lists the fonts it needs that are not bundled:
  `fonts: [{ family, weight, style, file }]`. Both hosts load them before
  drawing; a file that is missing draws in the fallback family with a
  warning.

Operations (`src/utils/edl/elementClip.js`): `insertElement(edl, kit,
elementId, slots, { time, duration, trackId })`, `updateElementSlots`,
`restyle`, `detachElement`, `elementClips`, `staleElements(edl, kit)`.
Segments are inserted with a ripple by default; a `stinger` is centred on
the nearest cut.

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
