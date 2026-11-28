# The Director's Site Demo

`site_demo` makes a demo of a web page: from an address and a few plain
lines it records the page being scrolled, clicked and typed into — a
[web clip](./WEBCLIP.md) — and frames the recording with zooms on what
matters, captions and a background. It returns an ordinary `DirectorResult`
fragment ([API.md § Director](./API.md#director)) that merges with
`applyDirectorResult` like every other director result. Nothing in it is
baked: the page is a web clip that can be opened, changed and recorded
again, the zooms are keyframes, the captions titles, the background a
generator.

It follows the director's one design rule ([DIRECTOR.md](./DIRECTOR.md)): a
plan says *what*; deterministic code does all matching, timing and layout.
A language model never writes a time, a selector or a coordinate.

```text
address ─► look at the page ─► demo plan ─► match names ─► time ─► record ─► frame ─► DirectorResult
           (a snapshot)         ▲    ▲      (snapshot      (pacing)  (web clip  (zoom, captions,
                       brief's lines  LLM    elements)               recorder)   window, title)
                       or a tour  (optional)
```

## The action

| Field | Value |
| ----- | ----- |
| `action` | `site_demo` |
| LLM | optional (`params.useLlm`) |
| Modes | all; default `replace` |
| `prompt` | The brief. Without the LLM: one line per step. With it: a description of what to show. Empty: a tour of the page |

| Param | Values | Meaning |
| ----- | ------ | ------- |
| `url` | text, **required** | The page: `http://` or `https://`. A bare `example.com/page` is read as `https://…` |
| `look` | `window` (default), `full` | [Looks](#looks) |
| `theme` | `auto`, or a [motion theme](./DIRECTOR-MOTION.md#themes) | Colours and type of the background, the captions and the title card |
| `size` | `auto`, or a page size of the web clip editor (`desktop`, `wide`, `tablet`, `phone`) | [The page](#the-page) |
| `pacing` | `slow`, `medium`, `fast` | [Timing](#timing) |
| `duration` | 0–600 s, default 0 | Target length. 0 = what the steps and captions take; in mode `range` 0 fills the range |
| `zoom` | toggle, default on | Zoom in on what is clicked and typed into. "zoom in on …" steps always zoom |
| `captions` | toggle, default on | Show what follows ` \| ` on a line while it happens |
| `title` | text | A title card before the recording; `Title \| subtitle`. A `# …` line of the brief sets it too |
| `useLlm` | toggle, default off | Let the language model plan the demo |

```json
{
  "action": "site_demo",
  "prompt": "click Yearly | two months free\nhighlight the Pro plan\ntype hello@example.com into Email | sign up in seconds",
  "params": { "url": "https://example.com", "theme": "paper" }
}
```

The frame size and rate come from the adaptation (or the posted `edl`); the
recording is made at that frame rate, so the clip is not stale when it lands.

## The brief

`src/utils/director/web/brief.js`, `readers.js`. Without a model every
non-empty line is one **stop**, written the way one would tell a colleague.
Wording is read generously — synonyms, articles, quotes, "the … button",
a leading "then" — and meaning strictly:

| Line | Stop |
| ---- | ---- |
| `click Pricing` · `tap on the Pricing link` · `open Pricing` | click |
| `hover Get started` · `mouse over …` · `point at …` | hover |
| `type hello@example.com into Email` · `fill Email with …` · `enter … in the Email field` | type; without a field, into whatever has the focus |
| `scroll to Features` · `go to Features` · `show me the Features` | scroll |
| `scroll down` · `scroll up 300` · `scroll to the top` · `back to top` | scroll by a screen, by pixels, to an end |
| `highlight the Pro plan` · `outline …` · `circle …` · `spotlight …` | highlight (`spotlight` dims everything else) |
| `zoom in on the chart` · `focus on …` · `close-up on …` | focus: the camera goes close |
| `press Enter` · `hit Ctrl+K` · `press the Tab key` | press, when what follows is a key |
| `select Pro from Plan` · `set Plan to Pro` | select an option |
| `go to /pricing` · `open https://…` · `visit example.com/docs` | goto, when what follows looks like an address |
| `wait 2` · `pause for half a second` | wait |

- A **caption** follows ` | `, an em dash, ` – ` or ` -- `. A line that
  starts with the separator is a caption shown while the page rests.
- Bullets and numbering in front are dropped. `click A, then click B` (also
  `;`) is two stops.
- Quotes keep words together: `type "made in France" into Origin`.
  Unquoted, the text ends at the last ` into ` (or ` in `).
- `press Sign up` is a click (no such key); `go to Pricing` a scroll (no
  address); `select Yearly` a click (no "from").
- A line that is **not an instruction** is a place to look at: the page
  scrolls to the heading or section that matches it best and the line is
  its caption. `Our plans | fair and simple` scrolls to what "Our plans"
  matches and says "fair and simple".
- A line starting with `#`, or `Title:`, is the title card
  (`# Tideline in 20 seconds | changelogs people read`).
- At most 40 stops; captions over 140 characters are cut at a word.

The first note of the result says how every line was read: `The brief was
read as 3 stops: 1 click “Yearly” · 2 highlight “Pro plan” · 3 type
“hello@example.com” into “Email”.`

### A tour

No brief at all: the page is toured (`places.js`). The stops are the first
heading of every stretch of headings — headings less than half a view apart
count as one place, so the cards of a grid do not each get a stop — from the
first one below the opening view down the page, and then the page's **call
to action**: the link or button that reads most like one ("Get started",
"Sign up", "Create account", "Book a demo" …), a button-sized one before a
text link, the lowest on the page among equals. The pointer goes to it and
the camera goes close. Without a target length a tour visits up to 8 places;
with one, as many as fit, spread over the whole page, and a note counts the
ones passed by. A tour has no captions.

## The demo plan

The compact JSON a language model returns, and the same shape the brief
reader and the tour produce. Schema: `src/utils/director/web/planSchema.js`.

```json
{
  "title": "Pricing in ten seconds",
  "stops": [
    { "do": "scroll", "on": "Pricing", "say": "Plans for every team" },
    { "do": "click", "on": "Yearly", "say": "Two months free when you pay yearly" },
    { "do": "highlight", "on": "the Pro plan" },
    { "do": "type", "on": "Email", "text": "hello@example.com", "say": "Sign up in seconds" },
    { "do": "press", "text": "Enter" }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `stops[]` | Required, 1–40. Played one after another |
| `do` | Required. A step kind of the recipe library — **read from its table** (`STEP_KINDS`), minus `move`, `hide` and `run`: `wait`, `hover`, `click`, `type`, `press`, `scroll`, `select`, `highlight`, `focus`, `goto`. A plan can never carry a script |
| `on` | The *name of a thing on the page as a person would say it*: "Pricing", "the Email field". For `scroll` also `top`, `bottom`, `down`, `up`. Required for click, hover, scroll, select, highlight, focus |
| `text` | What is typed (`type`), the key (`press`: `Enter`, `Control+k`), the option (`select`), the address (`goto`, may be relative), the seconds (`wait`), the style (`highlight`: `spotlight`), the pixels (`scroll` `down`/`up`). Required for type, press, select, goto |
| `say` | The caption shown while the stop happens. Up to 140 characters |
| `title` | A title card before the recording |

What a kind needs follows from the step table (`stopNeeds`). A plan never
holds a selector, a coordinate or a time.

## With a model

`params.useLlm` asks the configured LLM for the plan
(`prompts/siteDemo.js`). The system prompt lists the kinds of stop with the
step table's own descriptions and shows the example plan. The user prompt
shows the **page digest** (`digest.js`): what the snapshot found, in page
order, grouped under the headings a tour would stop at — kind and name
only, never a selector or a position:

```text
"Tideline — changelogs people read" — https://example.com/ — seen 1280 × 720, 2516 px tall
(top of the page)
  link "Features"
  link "Pricing"
heading "Pricing"
  button "Monthly"
  button "Yearly"
  section "Pro plan"
```

It is budgeted at 6,000 characters: every heading stays, long groups are
cut short (`… and 12 more`), and a note says when not everything was shown.
After it come the timeline's format, the target length with a suggested
number of stops, the pacing, whether captions are wanted, and the brief.

**From reply to plan** (`web/parse.js`, `normalize.js`, `request.js`) — the
procedure edit plans and motion plans go through: reasoning blocks are
stripped; JSON is taken from a code fence or the first balanced object;
`jsonrepair` fixes what `JSON.parse` rejects; harmless deviations are
normalised (keys such as `steps`, `action`, `target`, `caption`, `value`; a
bare list; a `{ "plan": … }` wrapper; verbs like `tap`, `zoom in`,
`navigate`; a stop written as a sentence, which is read like a line of the
brief); then the plan is validated with ajv and each stop checked for what
its kind needs. If it is invalid the model is asked **once** more with the
errors listed. If the retry is still invalid, the stops that can be played
are kept and the rest named in the notes; if none can, the model's plan is
given up.

The LLM is *optional* here: when it cannot be reached, is not configured or
returns nothing usable, the brief is read line by line (or the page toured)
and the first note says so. A name the model made up is treated like any
other name: matched to the page, or looked for by its text.

## Matching names

`src/utils/director/web/match.js`, `src/api/director/web/resolve.js`. The
page is **looked at** through the recorder's snapshot
([WEBCLIP.md § Server](./WEBCLIP.md#server)) before anything is planned;
its `elements` — links, buttons, form controls, headings, images, sections,
each with a name and a target that finds exactly it — are what names are
matched to.

1. The name is cleaned: quotes and a leading article go, and a closing
   word that only says the kind ("the Email **field**", "the Pricing
   **link**") becomes a hint.
2. Every element gets a fit: exact (1) · same but for case (0.97) · same
   but for punctuation and spacing (0.94) · one name is part of the other
   (0.6–0.9) · they share words — plurals count as the same word, articles
   and the like do not count (0.42–0.6). Less than 0.42 is no fit.
3. The kind the verb implies is preferred, by a bonus of up to 0.3:
   links and buttons for `click`, sections then headings for `scroll`,
   sections and images for `highlight` and `focus`. `type` and `select` only
   ever go to a form control. A said kind wins when anything of it fits.
4. Among equals, the first on the page.

So `click Pricing` is the menu link and `scroll to Pricing` the section;
`highlight Pro` the plan's card rather than its heading. A fit below 0.9
is reported: `Stop 3: “the chart” was taken to be the image “Readers
chart”.`

**The page is read again** — a new snapshot after the steps so far — when
a step may have changed it: before a name that is not found after a click,
a key or typing; after a click on a link; after a `goto`. At most four
looks in all (each starts a browser, about half a second here); the notes
say when it happened.

**A name nothing fits** becomes `text=<name>` (`label=<name>` for a
field): the recorder looks for it when it gets there. Every recipe uses
`onMissing: skip`, so a step whose target is missing — or covered — passes
without stopping the recording, and what the recorder says about it is in
the notes (`The recorder says: Step 4 (click): … — skipped`). A `scroll`
whose name is a sentence that matches nothing becomes a pause with its
caption.

## From stops to a recipe

`steps.js`, `view.js`. One stop is one step of the
[recipe](./WEBCLIP.md#the-recipe), with its caption as the step's `note`:

- `scroll` shows something tall from its top (`align: start`); a heading
  through the section it opens, or — a heading on its own — a fifth of the
  view below the top, clear of a sticky menu; anything small in the middle.
- **Centring.** A zoom can only centre what is well inside the view — at
  the edge, the picture's own edge is in the way. So the demo follows, as
  far as the snapshot can tell, where the page is scrolled to, and before a
  step the camera zooms in on, a target that is in view but outside the
  middle half of it is first scrolled to the middle (0.7 s; the stop then
  has two steps) — also before a hover on what the camera goes close to
  right after, so the pointer is on it when it does. A target out of view
  needs none: the recorder brings it to the middle during the step.
- `press` reads `Control+k`, `esc`, `the down arrow`; `wait` takes its
  seconds (at most 60).

### The page

`sizes.js`. With `size: auto` the page follows the shape of the frame:

| Frame | Page | Scale | Pointer |
| ----- | ---- | ----- | ------- |
| wide (6:5 and wider) | 1280 × 720 | 2 | arrow |
| tall (5:6 and taller) | 390 × 844 | 3 | touch dot |
| in between | 960 × 960 | 2 | arrow |

In the `full` look an `auto` page takes the frame's exact shape instead
(390 × 694 in 9:16), so nothing of it is cut off. A chosen `size` is the
web clip editor's (`#utils/webUi/sizes.js`) in either look. The pointer is
drawn 1.4× its size; a page narrower than 900 px gets a translucent dot.

### Timing

`pacing.js`, `holds.js`. All times are whole frames, and the recipe's
[score](./WEBCLIP.md#the-score) agrees with them exactly.

| Pacing | Scale | A place is looked at | A caption is read in |
| ------ | ----- | -------------------- | -------------------- |
| `slow` | 1.3 | 2.4 s | 1.3 s + 0.36 s per word |
| `medium` | 1 | 1.8 s | 1.0 s + 0.28 s per word |
| `fast` | 0.75 | 1.2 s | 0.7 s + 0.20 s per word |

- A step's action and the pause after it take what the step table gives
  its kind, times the scale; typing is 14 characters a second divided by it.
- A stop with a caption lasts at least as long as the caption takes to read.
- A place that was scrolled to — a scroll followed by another scroll, or
  by nothing — is looked at; so is the opening view, when the demo starts
  by scrolling away from it.
- **Target length.** The pauses — never the actions — are scaled by one
  factor and the frames shared out so the fragment ends exactly on the
  target (the title card counts). No pause goes under 0.15 s and a caption
  keeps 65% of its reading time; when that makes the demo longer than
  asked, or pauses were stretched more than 2.5×, a note says so.

## Recording

The recipe is recorded **inside the director job** by the web clip
recorder (`recordToCache`), into `<project>/.nearedit/web/<key>.mp4` with
its track — where the editor looks for a web clip's recording. Progress is
forwarded (`recording frame 120 of 570`); cancelling the job closes the
browser and leaves no file. The same demo asked for again finds its
recording and takes a second. A demo of 19 s at 1280 × 720 × 2 takes about
half a minute here. Site demos record one at a time
(`WEB_CAPTURE_CONCURRENCY`).

### Refusals

| When | What |
| ---- | ---- |
| No `url`, or not an `http(s)` address | `422`, `fields["params.url"]`, before a job exists |
| A private address on its face — `localhost`, `127.0.0.1`, `10.…`, `[::1]` … — not named in `WEB_CAPTURE_ALLOW` | `422` before a job exists, with the recorder's own sentence and the setting that would allow it |
| No usable chrome-headless-shell | The job fails at once with the recorder's reason and how to install one |
| A name that resolves to a private address, a page that does not load | The job fails with the recorder's explanation, on the first look at the page |

## The fragment

`src/api/director/web/build.js`. Everything is placed in whole frames.

| Row | Name | Holds |
| --- | ---- | ----- |
| video 0 | Titles | The title card's title; the captions |
| video 1 | Text | The title card's subtitle |
| video 2 | Page | The web clip |
| video 3 | Background | The generated ground |

**The page** is one clip: `sourceFile` the recording, `web` its recipe, key
and page title — so it is a web clip the editor can change and record again
— with the zoom keyframes, and in the window look a `mask` and a
`dropShadow`. As a window, or after a title card, it fades in over 0.4 s.
One **marker** per stop carries its caption, or what it does.

### Looks

`stage.js`. Worked out by rendering and looking.

- **`window`.** The page keeps its own shape and sits as a window over
  the ground: 5.5% of the frame's shorter side in from the edges, corners
  rounded by 2% of it (`mask`, a rectangle with a radius, 1 px feather), a
  soft shadow under it (`dropShadow`: 1.6% down, 2.6% blur, half strength,
  in the ground's deepest tone). Effects act in frame space, so **the
  window never moves**: the clip's scale and offset set the page inside
  it. When the demo has captions the window is raised and made smaller —
  4.5% from the top — to leave a band of the ground under it, 13.5% of the
  shorter side in a wide frame and 17% otherwise: captions are set there
  and never cover the page.
- **`full`.** The page fills the frame (`fit: cover`). No ground, unless
  there is a title card to carry.

The **ground** is the theme's signature [background](./DIRECTOR-MOTION.md#backgrounds)
— one generator clip under the whole piece, title card included — in the
colour way of the theme closest to the page's own colour. `theme: auto`
(`theme.js`) looks at the snapshot's picture: a dark ground for a light
page, the light one (`paper`) for a dark page, and among those the theme
whose light is nearest the hue of the page's accents.

### Zoom

`camera.js`. The keyframes are the web clip library's
([WEBCLIP.md § Zoom](./WEBCLIP.md#zoom)), made from the recording's track
for the *window* as the frame and then fitted to it (scale × the window's
own, offsets from its centre) — so zooming **moves closer to the page
inside the window**; the rounded corners and the shadow stay, and no edge
of the page can show. Settings: margin 0.3, fill 0.62, at most 2×, 0.7 s
back, zooms closer than 1.5 s glide into each other.

- A click is zoomed on its target; a field that is typed into on where
  the words appear (its first 6.5 heights), not on its whole width.
- "Zoom in on …" goes closer (margin 0.15, fill 0.8) — and when the thing
  is too big for that, it is framed edge to edge, so the camera still moves.
- With `zoom` off only "zoom in on …" steps move the camera.

### Captions

`captions.js`. A caption shows from the start of its stop to its end,
fading over 0.2 s, in the theme's reading face (its subtitle font, at
least medium weight), in the theme's ink.

- Under a window: on the ground, in the band — type 3.6% of the shorter
  side tall, up to three lines, with the shadow or halo the theme gives
  its titles.
- Over a full page: on a rounded plate in the ground's deepest colour, at
  the foot of the picture — or at its head when the stop's target, as the
  camera shows it at that moment, is where the plate would be.

### Title card

`card.js`. `params.title`, a `# …` line of the brief or the plan's `title`
makes one scene of the [motion piece](./DIRECTOR-MOTION.md) builder — the
title and an optional subtitle, in the theme's type and animation — placed
before the recording. Its words leave, then the window arrives over the
same ground.

### Cost

Measured here at 1920 × 1080 (`nearedit render --preset standard`, four
shared cores, footage decoded from the 2560 × 1440 recording): about 115 ms
a frame for the window look — the recording, a mask and a shadow over a
generated ground — and 65 ms for the full look.

## The result

A `DirectorResult` as in API.md, with:

- `tracks`: the four rows (plus, in `replace` mode, an empty entry for
  every other track of the posted document);
- `markers`: one per stop;
- `plan`: `title`, `page` (address, title, viewport, scale), `look`,
  `theme`, and every stop with the `target` it was given, its `start` and
  `end` in the recording and whether its target was `found`;
- `summary`: `Site demo of example.com: 6 stops, 19s — window look, Midnight,
  6 captions, 3 zooms`;
- `notes`: where the plan came from and how each line was read; the page
  and how its size was chosen; every name that was matched loosely or not
  at all; when the page was read again; what the recorder passed over; the
  look and how `auto` chose the theme; the zooms and captions; anything
  about length.

## Limits

- Everything [web clips cannot do](./WEBCLIP.md#limits) applies: no sound,
  no `<video>`, a fresh profile every time — a page behind a login needs a
  recipe with `storage`, written in the web clip editor.
- Names are matched to what a snapshot lists (300 elements at most, the
  visible ones); what only exists after an action is found by reading the
  page again, four looks at most.
- Whether a click leads to another page cannot be known beforehand; the
  page is read again after a click on a link.
- The zoom keyframes are fitted to the window. The editor's own "zoom"
  command (`applyWebZoom`) assumes a clip that fills the frame: on a
  window-look clip it replaces them with full-frame ones.
- A missing browser is found out inside the job, not before it: the
  recorder's status is an asynchronous question and `prepareRequest` is
  not. `precheck(prepared)` in `request.js` asks it, for a route to await.
- Site demos take turns among themselves, but a demo's recording does not
  queue in the `web` job lane: one can run beside a recording started from
  the web clip editor.
- The model sees names only. It cannot know what a page looks like.

## Code map

| Path | What |
| ---- | ---- |
| `src/utils/director/actionsWeb.js` | The action schema |
| `src/utils/director/web/` | Isomorphic and pure: plan schema, brief grammar (`brief.js`, `readers.js`, `keys.js`, `words.js`), name matching, places and tour, steps, centring, pacing, page sizes, digest |
| `src/api/director/actions/siteDemo.js` | The action |
| `src/api/director/prompts/siteDemo.js` | The LLM prompt |
| `src/api/director/web/check.js`, `survey.js`, `resolve.js`, `plan.js` | Refusals; looking at the page; names → steps; where the plan comes from |
| `src/api/director/web/normalize.js`, `parse.js`, `request.js` | LLM reply → plan, with one retry |
| `src/api/director/web/record.js` | Recording inside the job |
| `src/api/director/web/stage.js`, `camera.js`, `captions.js`, `card.js`, `theme.js`, `build.js`, `notes.js` | The look, the zoom, the captions, the title card, the theme, the fragment, the notes |
| `src/api/director/web/testing/` | A test site worth demoing, the same page as data, a stand-in recorder |

Tests sit beside the code (`node --test`): the grammar in many wordings,
matching, tour, pacing and length fitting against the recipe library's own
score, plan parsing and salvage, the stage, camera and captions in 16:9,
9:16 and 1:1, the action against a stand-in recorder (every merge mode,
the LLM against the fake server), and against the real recorder on the test
site — skipped, saying why, where there is no chrome-headless-shell.
