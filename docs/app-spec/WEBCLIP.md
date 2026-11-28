# Web Clips — Scripted Recordings of Real Web Pages

A **web clip** is a clip whose picture is a web page being used: a URL and
a short script of steps — scroll here, move there, click, type — that
NearEdit plays in a headless browser and records, frame by frame, into
ordinary footage. It is what a screen recording of someone using a site
would be, except that every pause, every cursor path and every scroll can
be changed afterwards and recorded again, and nobody has to perform it.

```text
recipe (in the clip) ─► score (pure: when each step happens) ─► recorder (headless
Chrome, stepped one frame at a time) ─► recording .mp4 + track .json ─► an ordinary
video clip: preview, effects, keyframes and render treat it like any footage
```

**Why not an iframe.** Most sites refuse to be framed, a framed page of
another origin cannot be scripted or drawn into a canvas, and nothing in a
live page happens at the same moment twice. A recording is footage: it
composites, it renders, and it is the same picture every time it is shown.

## The recipe

Stored in the clip as `clip.web.recipe`. Everything has a default; the
smallest recipe is `{ "url": "https://example.com" }`.

| Field | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `url` | string | — | `http:` or `https:`. Required |
| `viewport` | `{ width, height }` | 1280 × 720 | CSS pixels, 320..3840 × 240..2160 |
| `scale` | number | 2 | Device pixels per CSS pixel, 1..3. The recording is `viewport × scale` pixels, so text stays sharp when the clip is zoomed |
| `colorScheme` | `light` \| `dark` | `light` | `prefers-color-scheme` of the page |
| `lead` | seconds | 0.6 | Rest on the loaded page before the first step |
| `tail` | seconds | 1 | Rest after the last step |
| `cursor` | object | below | The pointer that is drawn |
| `hide` | target[] | `[]` | Elements removed from view before recording: cookie banners, chat bubbles |
| `storage` | string | `''` | A cookies / local-storage file (below), for pages behind a login |
| `onMissing` | `fail` \| `skip` | `fail` | What a step does when its target is not on the page |
| `steps` | step[] | `[]` | At most 200 |

`cursor`: `{ style: 'arrow' | 'dot' | 'none', size: 1, color: '#111827',
clicks: true }` — `arrow` becomes a hand over links and buttons; `clicks`
draws a ripple at every press.

### Steps

A step is `{ "do": <kind>, … }`. Steps play one after another. Each has a
**`duration`** — how long the action itself takes — and a **`hold`** — how
long to rest afterwards. Both are seconds and both can be set on any step;
the defaults are below. A step may carry a `note` (a caption for the
director, a label on the timeline) and an `ease` for its motion (an
[easing](./EDL.md#keyframes), default `ease-in-out`).

| `do` | Parameters | `duration` | `hold` | What happens |
| ---- | ---------- | ---------- | ------ | ------------ |
| `wait` | — | 1 | 0 | The page plays on |
| `move` | `target` | 0.7 | 0.2 | The cursor glides to the middle of the target |
| `hover` | `target` | 0.7 | 1 | The same, and stays |
| `click` | `target`, `button` (`left`), `count` (1) | 0.7 | 0.6 | Glide, then press and release at the end of the glide |
| `type` | `text`, `target`?, `speed` (14 chars/s), `clear` (false) | 0.5 + length / speed | 0.5 | Click the target if given, then type key by key |
| `press` | `key` (`Enter`, `Tab`, `Escape`, `ArrowDown`, `a`…), `modifiers` (`[]`) | 0.15 | 0.4 | One key |
| `scroll` | `to` (a target, `top`, `bottom` or pixels) or `by` (pixels), `align` (`center`) | 1 | 0.4 | The page scrolls smoothly |
| `select` | `target`, `value` | 0.7 | 0.6 | Glide to a `<select>` and choose an option |
| `highlight` | `target`, `style` (`outline` \| `spotlight`), `color` | 0.4 | 1.5 | A ring around the target, or everything else dimmed; shown through the hold |
| `focus` | `target`, `zoom` (0 = fit) | 0.6 | 1.5 | Nothing on the page — a camera cue: [zoom](#zoom) |
| `goto` | `url` (may be relative) | 0 | 1 | Navigate; the new page appears loaded |
| `hide` | `target` | 0 | 0 | Remove an element from view |
| `run` | `js` | 0 | 0.2 | Run a script in the page |

A target outside the viewport is scrolled into the middle of it **during**
the step's `duration`, while the cursor travels — so timing never depends
on the page. A step with `duration: 0` happens between two frames.

### Targets

A string, or `{ "x": 640, "y": 300 }` (CSS pixels in the viewport).

| Form | Finds |
| ---- | ----- |
| `text=Get started` | The element showing that text (case and spacing ignored; exact first, then containing), links, buttons and form controls preferred |
| `label=Email` | The form control with that label, placeholder, `aria-label` or `name` |
| `css=#pricing .card` or just `#pricing .card` | A CSS selector |

The first **visible** match in document order is used; a step may add
`"index": 1` for the second. A target that is not found fails the recording
with the step's number and what was looked for — or, with
`onMissing: skip`, the step's time passes and nothing else happens.

### Storage file

`storage` names a JSON file inside the project folder:
`{ "cookies": [{ name, value, domain, path, … }], "origins": [{ "origin":
"https://app.example.com", "localStorage": [{ name, value }] }] }` — the
format browser automation tools export. It is read at recording time and
never copied into the document.

## The score

`compileScore(recipe, fps)` (`src/utils/web/score.js`, pure) turns a recipe
into times, without looking at any page:

```js
{ fps: 30, duration: 9.4, frames: 282,
  steps: [{ index: 0, do: 'click', start: 0.6, actionEnd: 1.3, end: 1.9, note: '' }, …] }
```

`start` is where the step's `duration` begins, `actionEnd = start +
duration`, `end = actionEnd + hold`; the first step starts at `lead`, the
recording ends `tail` after the last. All times are whole frames. A clip
therefore knows its length before anything is recorded, and the timeline
can show its steps as ticks.

## Recording

`key` = the first 20 hex digits of the SHA-256 of the canonical recipe
(`recipeKey(recipe, fps)`: normalised, defaults filled in, keys sorted,
notes left out) and the recorder's version. A recording lives in the
project (or, for the command line, beside the document):

```text
<project>/.nearedit/web/<key>.mp4     H.264, viewport × scale pixels, the score's fps, no audio
<project>/.nearedit/web/<key>.json    the track, below
```

The same recipe is never recorded twice; a changed recipe has a new key.

**How a page is stepped.** The recorder drives `chrome-headless-shell`
over the DevTools protocol (`src/api/web/`), with begin-frame control: for
every frame it (1) applies what the score says for that instant — cursor
position, scroll position, key and button events, sent without waiting,
(2) advances the page's clock by exactly one frame
(`Emulation.setVirtualTimePolicy`), (3) asks for exactly one frame with
its screenshot (`HeadlessExperimental.beginFrame` with an explicit frame
time). Timers, `requestAnimationFrame`, CSS transitions and animations all
move one frame per frame, so a hover fades in over the right number of
frames however long the capture takes. While a page is loading, or a click
has started a request, the clock waits for the network: the recording shows
a site that answers instantly. A request that never finishes holds the
clock for at most 5 real seconds.

Measured on 4 shared cores (Chrome 158): about 10 ms per frame at 1280 ×
720, 20 ms at 1920 × 1080, 30 ms at 1280 × 720 × 2 — faster than real time.

**The track** is what happened, for the editor and the director:

```js
{ version: 1, key, url, title, fps, duration, viewport, scale, width, height,
  steps: [{ index, do, start, actionEnd, end, note, target, missing: false,
            rect: { x, y, width, height },   // of the target, viewport CSS px, at the action
            point: { x, y } }],              // where the cursor went
  cursor: [[t, x, y], …],                    // only when it moved
  scroll: [[t, y], …],
  warnings: [] }
```

## In the document

```json
{ "sourceFile": "/project/.nearedit/web/3fa9c1….mp4", "sourceIn": 0, "sourceOut": 9.4,
  "web": { "recipe": { "url": "https://example.com", "steps": [] }, "key": "3fa9c1…",
           "title": "Example Domain" } }
```

- `web.recipe` is the source of truth; `web.key` is the key of the
  recording `sourceFile` points at ('' = not recorded yet); `web.title` is
  the page's title, for labels.
- Until it is recorded a web clip is a placeholder with a length — the
  score's `duration`. Recorded, it is a video clip like any other.
- **Stale:** `web.key !== recipeKey(web.recipe, fps)`. The old recording
  keeps playing until the new one is ready.
- `isWebClip(clip)` is `Boolean(clip.web?.recipe?.url)`. The recipe is
  bounded data, sanitised on load like other [free-form
  data](./EDL.md#free-form-data) and then normalised by
  `normalizeRecipe`.

Operations (`src/utils/edl/webClip.js`): `insertWebClip(edl, recipe,
{ time, trackId })`, `updateWebRecipe(edl, clipId, patchOrRecipe)` (the
clip's length follows the score when the clip showed the whole recording),
`setWebRecording(edl, clipId, { file, key, duration, title })`,
`webClips(edl)`, `staleWebClips(edl)`.

## Zoom

Zooming is not recorded. It is ordinary transform keyframes on the clip,
made from the track by `zoomKeyframes(track, frame, options)`
(`src/utils/web/zoom.js`, pure): for every `focus` step — and, with
`options.clicks`, every click — the picture scales up about the target's
rectangle during the step's `duration`, holds, and eases back before the
next step that needs the whole page. `applyWebZoom(edl, clipId, track,
options)` writes them (`transform.scaleX`, `scaleY`, `x`, `y`). They can
then be moved, re-eased or deleted like any other keyframes.

## Server

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/web/status` | `{ available, browser: { path, version }, reason, allow: [] }` |
| POST | `/web/snapshot` | `{ recipe, until? }` → the page after the first `until` steps (default: all): `{ url, title, viewport, page: { width, height }, scrollY, image, elements }` |
| POST | `/web/record` | `{ projectId, recipe, fps? }` → `202 { jobId }`; job type `web`, result `{ file, key, duration, fps, width, height, title, track, cached }` |
| GET | `/web/track?projectId=&key=` | The track of a recording |

`elements` is what a person or the director can aim at — links, buttons,
form controls, headings, images and landmark sections, at most 300:
`{ kind, name, target, rect: { x, y, width, height }, visible }`, with
`rect` in page CSS pixels and `target` a string that finds exactly that
element. `image` is a PNG data URL of the viewport.

A browser is found in this order: `WEB_CAPTURE_BROWSER`, the copy
`npm run install-browser` puts in the data folder, then Playwright's and
Puppeteer's caches. It must be **chrome-headless-shell**: ordinary Chrome
has no begin-frame control. Without one, `/web/status` says so and how to
get it; nothing else in NearEdit is affected.

### What the browser may load

A recording browser on the server could otherwise be pointed at whatever
the server can reach. So:

- Only `http:` and `https:` pages. Never `file:`.
- **Private addresses are refused** — loopback, RFC 1918, link-local
  (including cloud metadata addresses), CGNAT, unique-local IPv6 — for the
  page itself and for everything it loads, checked on every request after
  resolving the name, and again against the address that actually answered.
  `WEB_CAPTURE_ALLOW` lists exceptions: `localhost:5173,*.staging.example.com`.
- A fresh, empty browser profile for every recording; downloads, extra
  permissions and service workers off; the Chrome sandbox on unless
  `WEB_CAPTURE_NO_SANDBOX=1`.
- Limits: 10 minutes and 200 steps per recording, 60 s to load a page, one
  recording at a time (`WEB_CAPTURE_CONCURRENCY`).

## Command line

```bash
nearedit record recipe.json -o demo.mp4          # one recipe → a recording and its track
nearedit render timeline.json                    # records its web clips first, then renders
```

`render` and `frame` record any web clip whose recording is missing into
`.nearedit/web/` beside the document.

## Limits

- Needs `chrome-headless-shell`; begin-frame control is an experimental
  part of the DevTools protocol.
- `<video>`, WebGL and `<canvas>` animations driven by their own clocks
  are not stepped with the page and may stutter or freeze. No sound.
- Native pop-ups (a `<select>` list, a file chooser, an alert) are not
  drawn; `select` sets the value directly, alerts are dismissed.
- Two recordings of one recipe show the same thing but are not guaranteed
  to be identical to the bit; the recording that exists is the one used.
- A recipe is replayed from a fresh profile every time: it must reach the
  state it shows by itself (or through `storage`).
