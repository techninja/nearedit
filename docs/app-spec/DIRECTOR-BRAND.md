# The Director Works in the Brand

A project has a [brand kit](./BRAND.md): colours, fonts, a logo, the way a
name appears under a speaker, the bumper at the start, the sound. The
director reads the project's **effective kit** on every job
(`projectKit(projectId, adaptationId)`, [BRAND-API.md](./BRAND-API.md) —
always a usable kit, never changed) and uses it as the default look. What
it makes is on brand without being asked, and one action — **Apply brand** —
dresses a finished timeline.

```text
project ─► effective kit ─┬─► motion piece   theme, intro / chapter / outro
                          ├─► site demo      ground, captions, intro (+ outro, bug)
                          ├─► score          style, key
                          ├─► edit plans     titles and named elements
                          └─► brand pass     intro, outro, bug, names, stingers,
                                             chapters, caption style, restyle
```

It follows the director's one design rule ([DIRECTOR.md](./DIRECTOR.md)): a
plan says *what*; deterministic code decides timing and placement. A
language model is optional everywhere here, and never writes a time, a
colour or a font.

## What follows the kit

Each of these actions has `brand` in its form, as the **default**, where it
had `auto`. Naming anything else leaves the brand; `auto` is what it was.
The same request with the same kit gives the same result. Action schemas
carry a line `brand` ("Follows the brand kit: …"), which the panel shows.

| Action | Param | From the kit |
| ------ | ----- | ------------ |
| `motion_piece` | `theme: brand` | The [brand theme](#the-brand-theme); the opening, section cards and closing are its `intro`, `chapter` and `outro` elements (`bumpers`, default on) |
| `site_demo` | `theme: brand` | The ground in the brand theme's colours; captions are its `caption` element; a title card is its `intro`; `finished` adds its `outro` and `bug` |
| `score` | `style: brand`, `key: brand` | `tokens.sound.style` and `.key`; `.scale` where the style is written in it |
| `base_edit`, `generate_edit`, `execute_script` | — | What a plan puts on screen is drawn by elements: the opening title is `title`, a pick's title `lower-third`, and a plan may [name elements](#elements-in-a-plan) |
| `add_captions` | `preset: auto` | With no look named — in the form or in the request's words — a timeline that has no caption style of its own takes [the kit's](#the-caption-style-of-a-kit); one that has a style keeps it ([DIRECTOR.md](./DIRECTOR.md#working-on-the-existing-timeline)) |
| `brand` | — | [The brand pass](#the-brand-pass) |

Roles are resolved through the kit's `defaults` (`intro`, `outro`,
`chapter`, `bug`, `title`, `lowerThird`, `captions`, `transition`), so a kit
that names its own element for a role is followed (`elementFor`).

### The brand theme

`brandTheme(kit)` (`src/utils/director/brand/theme.js`, pure, the same
object for the same kit) makes a [motion theme](./DIRECTOR-MOTION.md#themes)
with id `brand` and the kit's name as its label.

| Theme | From |
| ----- | ---- |
| `ink`, `sub` | `color.text`, `color.muted`. Text that would not read on the background (contrast under 4.5) becomes black or white; muted text is moved towards the text colour until it reads |
| `accent` (rules, frames, rings) | `color.primary` (`color.accent` when the primary cannot be told from the background) |
| `backdrops` — three colour ways | The background and the surface, tinted with the primary and the accent **as far as the ink still reads** on them; edges darker on a dark kit, lighter on a light one |
| `title`, `subtitle` | `font.heading`, `font.body`: family, weight, italic, line height, tracking; `upper` sets the words in capitals; `scale` multiplies the size (0.15 and 0.046 of the shorter side) |
| `animations` | `motion.enter` and `motion.by` — one motion language, not chosen by the seed. `wipe` arrives as `slide-right`, `type` as `typewriter` |
| `transitions` | `wipe`/slides → wipe, fade; `scale` → iris, fade; `none` → cut, fade; otherwise fade |
| `accents`, rule thickness | `shape.stroke` (0 = no accents); a ring instead of a frame from `shape.radius` 2 |
| `backgrounds` | Dark kit: spotlight, gradient, noise. Light kit: dots (round corners) or solid first |
| `particles`, `look` | None, unless the form or the plan asks |

Every theme keeps `ink` and `sub` at a contrast of 4.5 on every backdrop
colour; the brand theme is made to, whatever the kit (tested for the
built-in kits and for kits with unreadable colours).

**A font of the kit's own.** Titles are measured on the server with the
kit's font files and name their family. A document draws a family that is
not bundled only when it lists the file (`edl.fonts`), so such a result
carries `document.fonts` — see [The result](#the-result).

### Motion piece

`params.theme` is `brand` (default), `auto` or a theme. With `brand`:

- the piece is completed and built in the brand theme;
- a scene may have a **kind** — `intro`, `chapter` or `outro` (the plan
  schema's `scene.kind`; a model may write it, and words like `opening`,
  `section`, `closing`). Without a model a line that begins `Intro:`,
  `Chapter:` or `Outro:` (also `Opening:`, `Section:`, `Closing:`) says it;
- with `bumpers` on, the **first scene is the intro** when the piece has
  two scenes or more, and the **last is the outro** when it has three or
  more — unless the plan names its own;
- a card scene is one **element clip** on the scene's background row,
  filling the frame for the scene's length and carrying the scene's
  transition (fade, wipe) the way a background does. `intro` takes
  `title` / `subtitle`, `outro` `title` / `text` (the scene's subtitle),
  `chapter` `title` / `number` (01, 02 … among the chapters). Nothing is
  laid over a card: no particles, accent or look.

The result's `plan` has `theme: "brand"` and each card scene its `kind`.
Under any other theme kinds are ordinary scenes, and a note says so.

### Site demo

`params.theme` is `brand` (default), `auto` or a theme. With `brand`:

- the ground is the brand theme's signature background, in the colour way
  nearest the page's own colour;
- **captions** are the kit's `caption` element, one clip per stop: under a
  window it is moved into the band kept for captions; over a full page it
  stays where the kit puts it, or goes to the head when the action is
  there. A kit whose caption has **no plate** (the built-in
  `documentary`) cannot be relied on over a page that may be white: in the
  full look its captions are set in the brand theme's type on a plate in
  its colours instead, and a note says so;
- the **title card** (`params.title`, a `# …` line) is the kit's `intro`,
  as long as the element says (4 s in the built-in kits), dissolving into
  the ground;
- `finished: true` — a finished piece — adds a row `Brand` in front with
  the kit's `bug` over the recording and its `outro` after it (title: the
  card's; text: the page's host), arriving over the last frames of the
  page. Without a title the intro takes the page's own title. A target
  length still ends the piece exactly on it.

### Score

`params.style` and `params.key` are `brand` (default), `auto`, or a value.

| | Decided |
| - | ------- |
| Style | The form's, when it names one. Else, with a model, the style its plan names. Else the style the **brief** names. Else the kit's `sound.style` (by id, label or a common word: `lo-fi`, `trap`). A kit style the director does not write: what the timeline suggests, among the styles of the kit's scale |
| Key | The form's; else a key the model was asked for; else the kit's `sound.key` |
| Scale | A style is written in one scale — its chords are spelled for it. The kit's `sound.scale` is honoured where the style agrees; otherwise the style keeps its own and a note says so ("The kit asks for the minor scale; Lo-fi is written in dorian, and keeps it") |

With a model the prompt says which style the brand sounds like.

## Elements in a plan

Wherever a plan becomes a timeline, an item may name an element of the kit
instead of describing a title. Schema: `ITEM_SCHEMA`
(`src/utils/director/brand/items.js`); an edit plan holds them as
`elements` (at most 40).

```json
{ "picks": [ { "file": "m3", "role": "primary", "segments": [1, 4] }, { "file": "m2" } ],
  "elements": [
    { "element": "intro", "slots": { "title": "A Day at the Park" } },
    { "element": "lower-third", "slots": { "name": "Ada Lovelace", "role": "Park ranger" }, "pick": 1 },
    { "element": "chapter", "slots": { "title": "The city" }, "pick": 2 },
    { "element": "stinger", "pick": 2 },
    { "element": "quote", "line": "We arrived early — Ada", "at": 12 } ] }
```

| Field | Meaning |
| ----- | ------- |
| `element` | Required. An element of the kit: its id, its label, a role (`lowerThird`), or a common word (`lower third`, `logo wipe`, `end card`). A role means the element the kit's `defaults` name |
| `slots` | Text by slot name; slots the element does not have are left out |
| `line` | The slots in one line, in the element's order, separated by ` \| ` or a spaced dash; a comma separates when the first slot is a name |
| `pick` | The pick of the plan it goes with, counted from 1 |
| `at` | Seconds into the edit (`"0:12"` is read as 12) |
| `duration` | Seconds; left out, the element's own |

**As a line** — the same grammar wherever a person writes one (`line.js`):
`lower third: Ada Lovelace, CEO, at 0:12` · `chapter: The river at 1:05` ·
`title: A Day at the Park | and what we found` · `stinger at 0:30`.

**From a model.** The edit-plan prompt gains a `BRAND` block: the kit's
elements with their slots, one line each (`lower-third (name, role?) —
Lower third: over the picture`), without the bug and the caption.
Normalisation forgives a list under `graphics` or `brand`, an item written
as a line, `type` for `element`, slots written flat, `over: "pick 2"`.
Invalid items are dropped one by one when a plan is salvaged.

**Realised with `insertElement`** on the assembled fragment
(`src/api/director/brand/dress.js`), in whole frames:

| Kind | Where |
| ---- | ----- |
| overlay | On the Titles row, over its pick (to the pick's end at most) or from `at`; behind another title it waits, and is left out — with a note — when under a second is left |
| segment | Rippled in on the Main row: before its pick, or at the pick boundary nearest `at`. An `intro` without a place opens the edit, an `outro` closes it; a `chapter` needs a pick |
| transition | Centred on the cut into its pick (or the cut within a second of `at`), on the Titles row when free there, else the B-roll row |

Markers and later picks move with a segment. An element the kit does not
have, a pick that is not in the edit, the bug (it spans a finished piece:
the brand pass places it) are dropped and said in `notes`. The resolved
items are in `DirectorResult.plan.elements`.

## The brand pass

Action `brand`, "Apply brand": in place, for the whole timeline (it has no
modes), LLM optional. One undo step.

| Param | | |
| ----- | - | - |
| `title`, `subtitle` | text | On the intro; the title on the outro too. No title: the project's name |
| `speakers` | text | `Ada Lovelace — CEO; Grace Hopper — Rear Admiral`. Also `Name, Role`, `Name (Role)`, and `… at 0:12` for a time |
| `intro`, `outro`, `bug`, `names`, `stingers`, `captions`, `restyle` | toggles, default on | The parts. `stingers` is the chapter cards' switch too |
| `useLlm` | toggle, default off | Let the model read who speaks where |

`prompt` (optional) adds, a line each: `speakers: …`, `chapters: Arrival;
The river at 1:05; Home`, an element as a line (a lower third with a time,
`outro: Thanks for watching | example.com`, `quote: … at 0:20`), and parts
left out in plain words — `no bug`, `without the intro`, `skip stingers`,
`no chapter cards`. A line that is not understood is said in `notes`.

### What it places

The pass is `brandPass(edl, kit, plan)` (`src/utils/director/brand/pass.js`)
— pure, isomorphic, made of the editor's own operations.

| Part | Rule |
| ---- | ---- |
| Intro | Rippled in at the start of the timeline, on the track of the first picture: everything moves later by its length (4 s in the built-in kits), markers and regions too |
| Outro | Where the last picture ends, on its track, **without a ripple**: nothing moves, and music may run on under it |
| Bug | From the end of the intro to the start of the outro, on a track `Logo`. It is re-spanned on every pass, so it follows the piece as it grows |
| Lower thirds | One per speaker, at the first word they speak, for the element's length or until their clip ends |
| Stingers | The kit's transition on the cut within 0.75 s of each **named marker**, the moment it covers the frame on the cut. A marker that is not on a cut gets none |
| Chapter cards | One per chapter the request lists: at its time, else at the marker of that name, else at the named markers in order — on the cut there when one is near. Laid **over** the picture for the card's length; no stinger where a card is |
| Single elements | Each line of the brief that names another element with a time |
| Caption style | `setCaptionStyle(edl, captionStyleOf(kit))` |
| Restyle | Every element clip that is out of date with the kit (`restyle`), the editor's own too. Switched off, the pass still brings its own clips up to date |

The overlays go on a track `Brand`, in front of everything, and never
overlap there: a card comes first, a stinger gives way to it, a name ends
where the next thing begins or waits for it to leave (0.2 s later) while
its speaker still speaks — and is left out, with a note, when neither fits.

### Its rules

- **It is idempotent.** Every clip it places is marked in `intent`
  (`brand:intro`, `brand:outro`, `brand:bug`, `brand:name`,
  `brand:stinger`, `brand:chapter`, `brand:item`). A later pass finds its
  clips by the mark and **keeps them where they are, as long as they are**
  — the editor may have moved or trimmed them — changing only what they
  say (and, for the bug, its span). A second pass with the same request
  returns the very document it was given: nothing is committed, no undo
  step is added.
- **What is no longer asked for is taken away** — a speaker, a chapter, a
  marker that lost its name — but only overlays of the pass's own. The
  intro and the outro are never removed: delete the clip.
- **It never moves or changes a clip that is not its own**, but for the
  time the intro opens. An element somebody placed by hand has no mark and
  is left alone (restyle apart).
- **Locked tracks.** When a locked track holds clips the intro is left out
  — opening time would pull the timeline out of step with them — and a
  note says so. A locked picture track sends the outro to the `Brand`
  track. Out-of-date elements on locked tracks are counted, not changed.
- **A part switched off is not touched**: what an earlier pass placed stays.
- **An empty timeline** — nothing that is picture — is not dressed; its
  caption style is still set.

### Who speaks where

`speakingFiles` reads the posted timeline as the score does: clips on
audio tracks that sound, not music, through their file's transcript (the
first word the clip plays), else its segments, else — for a voice — what
is not silence. Files are taken in the order they first speak.

- **A time in the request wins** (`Ada Lovelace at 0:12`).
- **Without a model** the speakers are matched to the speaking files **in
  order**: the first name to the first file that speaks, and so on. The
  result says so (`Assumed: 2 speakers were matched …`) and each lower
  third says which file it was put over.
- **With a model** (`useLlm`) it is shown the transcripts of the speaking
  files only and the names, and answers `{ "speakers": [{ "name", "role"?,
  "file", "segment"? }] }`: whose file is whose and, where the words show
  it, the segment a person begins in. It never writes a time; a file or a
  segment it invents is not used. Named nobody, it may name the people who
  introduce themselves. When it cannot be reached or its answer is not the
  JSON asked for, the order decides and the first note says so.
- More names than speaking files, or nobody speaking at all: no lower
  third for those, and a note.

### What it says

`summary`: `Brand “Orbit”: placed intro, outro, logo bug, lower third and
stinger; caption style Boxed` — or `nothing to change — the timeline
already carries it (…)`. `notes`: a line for everything placed, updated or
removed, with its time and, for a name, what it was put over; what was
kept; the time the intro opened; the caption style; what was restyled;
what was assumed. `plan`: the title, the parts, the speakers with their
times, and `done` — every element with `placed`, `kept`, `updated` or
`removed`.

## The caption style of a kit

A kit carries the timeline's [caption style](./CAPTIONS.md#style) as
tokens — roles, not values, so a kit that changes a colour changes its
captions. `TOKEN_SCHEMA.caption`, simple types the token editor draws:

| Token | Type | Default | |
| ----- | ---- | ------- | - |
| `caption.preset` | select | `clean` | A caption preset: `clean`, `pop`, `karaoke`, `boxed`, `minimal` |
| `caption.font` | select | `heading` | `heading`, `body` — the kit's font — or `preset` |
| `caption.highlight` | select | `accent` | The colour of the word being said: `accent`, `primary`, `text`, or `preset` |
| `caption.size` | number, units | 0 | 0 leaves the size to the style |
| `caption.position` | select | `preset` | `top`, `middle`, `bottom`, or the style's own |

Built-in kits: `clean` → clean, `bold` → boxed in its heading font,
`documentary` → minimal in its body font, `playful` → pop. The tokens are
inherited through `extends` like every token, and are part of the kit key.

`captionStyleOf(kit)` (`src/utils/brand/captionStyle.js`, pure) gives what
a document stores — the preset and what differs:

```json
{ "preset": "boxed", "font": { "family": "Orbit Mono" }, "case": "upper", "size": 4.2,
  "color": "#f4f7ff", "plate": { "color": "#101c44", "radius": 0.4 },
  "highlight": { "color": "#ff6b2c" } }
```

- the **family** of the chosen font (the weight stays the preset's); a
  font set in capitals (`upper`) sets the captions in capitals;
- the font's `scale` multiplies the size — by its square root when the
  preset itself sets capitals, since the correction is for lower case;
- the **highlight** colour by role;
- for a preset with a plate: the plate in `color.surface` with
  `shape.radius`, the words in `color.text`. Without a plate the words
  stay the preset's white with its outline: they must read on any picture.

Two actions write it into a document. The brand pass sets it every time
it runs. `add_captions` sets it only as a default: when captions are
switched on, no look was asked for, and the timeline has no caption style
of its own (`edl.captions` is not there) — a timeline that has one, even
the plain default somebody chose, keeps it, and so does one this action
has styled once. Its result says so: "Captions switched on for 2 clips
(Boxed, from the brand kit)", with a note naming the kit and the font.

## The result

A `DirectorResult` ([API.md](./API.md#directorresult)) may carry
`document` — what it says about the document itself, beside its clips:

| Field | |
| ----- | - |
| `document.fonts` | Font files (`{ family, weight, style, file }`) to list in `edl.fonts`: those the titles of a motion piece or the caption style are set in |
| `document.captions.style` | The timeline's caption style |
| `document.regions` | The document's regions after a ripple (the intro) |

`applyDirected(edl, result)` (`src/utils/director/applyResult.js`, pure) is
`applyDirectorResult` with these applied in the same step: the font files
first — so the fragment's titles keep their family — then the merge, then
the style and the regions. Markers that came back unchanged keep their
ids, a clip that a whole-timeline result returned keeps its link to a
partner on a locked track
([DIRECTOR.md](./DIRECTOR.md#working-on-the-existing-timeline)), and a
result that changes nothing returns the document it was given. The
director panel applies results with it; `applyDirectorResult` alone still
merges every result, without those parts and without those links.

## The actions that work on a timeline

An element clip is one of two things to them (`inplace/kinds.js`): an
**overlay** — lower third, bug, stinger — lies over the picture like a
title; a **segment** — intro, chapter, outro — is a shot of the cut.

| Action | |
| ------ | - |
| `beat_sync` | Only shots make cuts. A cut that touches a card is left alone ("a card of the brand kit stands there"); a stinger that covers a cut **rides along** with it; overlays on the picture track are not re-timed |
| `remove_silence` | Elements are never targets and never split: like titles they follow the timeline, and a span that loses time ends earlier |
| `insert_broll` (cutaway) | Never on a track of brand overlays; in front of a card, which is picture |
| `score` | An element is a turning point like a title (a stinger at the cut it covers); a bug is not; overlays are not cuts |

## Limits

- Captions and lower thirds share the foot of the frame: captions are
  centred, a lower third sits left, and a long name reaches under a
  caption. Neither moves for the other.
- A chapter card of the pass covers the picture for its length; it does
  not take time of its own. The pass removes no intro or outro.
- The pass finds its clips by `intent`; a clip whose intent is changed by
  hand is the editor's from then on.
- Without a model, who is who is the order of the names — nothing more.
- In a generated edit an overlay that does not fit beside another is left
  out; there is one Titles row. The logo bug is the brand pass's.
- A brand theme has no particles and one motion language; `seed` still
  varies backgrounds, alignment and accents.
- A style keeps its scale: `sound.scale` chooses among styles, it does not
  transpose one.
- A kit's own font draws in a title only in documents merged with
  `applyDirected`.

## Code map

| Path | What |
| ---- | ---- |
| `src/utils/brand/captionTokens.js`, `captionStyle.js` | The caption tokens; `captionStyleOf` |
| `src/utils/director/brand/theme.js` | `brandTheme`, `themeFonts` |
| `src/utils/director/brand/elementClip.js`, `menu.js`, `place.js` | Roles and an element clip; elements by name; placing through `insertElement` |
| `src/utils/director/brand/items.js`, `line.js` | Element items: schema, normalising, resolving; the line grammar |
| `src/utils/director/brand/request.js`, `people.js` | Reading a brand request |
| `src/utils/director/brand/pass.js`, `passCards.js`, `passOverlays.js`, `passStingers.js`, `passNames.js`, `passDoc.js`, `marks.js` | The brand pass |
| `src/utils/director/applyResult.js` | `applyDirected` |
| `src/utils/director/actionsBrand.js`, `score/brand.js` | The action schema; a kit's sound |
| `src/api/director/brand/kit.js` | `kitOf(ctx)`; measuring with a kit's fonts |
| `src/api/director/brand/dress.js`, `assemble/elements.js`, `plan/elements.js`, `prompts/brand.js` | Elements in generated fragments; the prompt block |
| `src/api/director/inplace/brand.js`, `brand/speech.js`, `speakers.js`, `report.js`, `prompts/brandPass.js` | The action: speech, speakers, the report |
| `src/api/director/motion/dress.js`, `kinds.js`, `bumper.js` | The motion piece in the brand |
| `src/api/director/web/brand.js`, `brandCaptions.js`, `captionStops.js`, `finish.js` | The site demo in the brand |
| `src/api/director/score/brand.js`, `decide.js` | The score in the brand |
| `src/api/director/inplace/kinds.js` | Overlay or shot |
| `src/utils/directorUi/brandNote.js` | The panel's note |

Tests sit beside the code (`node --test`): the theme for every built-in
kit and for broken colours; items, lines and the request reader; the pass's
rules (switches, locked tracks, an empty timeline, nobody speaking,
chapters, idempotence, restyle); the caption tokens through `extends`; the
actions under a kit; plans with elements through the assembler and the
fake LLM; the pass with and without a model and through the route with a
library kit that has a font and a logo; the existing actions with element
clips.
