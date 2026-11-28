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

A step stores `duration` and `hold` only when they were set; otherwise the
default applies, which for `type` follows the text. Seconds are 0..120;
`type.speed` 1..60; click `count` 1..3; `scroll.align` is `start`, `center`
or `end`; at most 50 `hide` targets. The table itself is data —
`STEP_KINDS` in `src/utils/web/stepKinds.js` — and drives the editor's
forms, validation and the director's vocabulary.

### Targets

A string, or a point: `{ "x": 640, "y": 300 }` or `point=640,300` (CSS
pixels in the viewport).

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
recording ends `tail` after the last. Lead, every duration, every hold and
the tail are each rounded to whole frames, so equal steps take equal
frames. A clip therefore knows its length before anything is recorded, and
the timeline can show its steps as ticks (`stepMarks(clip, fps)`).

## Recording

`key` = the first 20 hex digits of the SHA-256 of the recorder's version,
the frame rate and the canonical recipe (`recipeKey(recipe, fps)`:
normalised, every step's effective `duration` and `hold` written out, keys
sorted, notes left out). It is computed the same way in the browser and on
the server. A recording lives in the
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
a site that answers instantly. When nothing has moved on the network for 5
real seconds the clock goes on without the request (a stream that never
ends is given up on for good). After every load the page gets one second of
its own time, unrecorded, to settle.

The pointer is not drawn until the first step that uses it; it then enters
from below the picture. It becomes a hand where the page asks for one, and
stays above modal dialogs. A target is brought into view by scrolling
whatever scrolls it — the page or a panel inside it. `hide` stays applied
when the page changes.

The recording is H.264 (`veryfast`, CRF 16, a key frame every half second
so it scrubs well): small text shows no visible difference from a lossless
frame. Measured on 4 shared cores (Chrome 158), per frame: about 10 ms at
1280 × 720, 20 ms at 1920 × 1080 and 34 ms at 1280 × 720 × 2 for a plain
page; about twice that for a page with gradients and shadows — still close
to real time. A product page at 1280 × 720 × 2 comes to about 2 Mbit/s.

**The track** is what happened, for the editor and the director:

```js
{ version: 1, key, url, title, fps, duration, viewport, scale, width, height,
  steps: [{ index, do, start, actionEnd, end, note, target, missing: false,
            rect: { x, y, width, height },   // of the target, viewport CSS px, at the action
            point: { x, y },                 // where the cursor went
            zoom }],                         // a camera step's own zoom
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
- **Stale** (`isStale(clip, fps)`): `web.key !== recipeKey(web.recipe,
  fps)` — which includes a clip that was never recorded. The old recording
  keeps playing until the new one is ready. Changing a document's frame
  rate makes its web clips stale.
- `isWebClip(clip)` is `Boolean(clip.web?.recipe?.url)`; clips that are
  not web clips have no `web` field at all. On load the recipe is
  normalised by `normalizeRecipe`, which reads only known fields and
  bounds every one.
- A web clip's source is its **score**, recorded or not: its source window
  stays inside `0 … score.duration`.
- `validateEdl` checks the block's shape, not whether the recipe would
  record — a half-written recipe can be saved. `validateRecipe` says what
  would stop a recording.

Operations (`src/utils/edl/webClip.js`): `insertWebClip(edl, recipe,
{ time, trackId })`; `updateWebRecipe(edl, clipId, recipe | (recipe) =>
recipe)` — a clip that showed the whole recording follows the new score's
length, a trimmed one is only kept inside it; `setWebRecording(edl,
clipId, { file, key, duration, title })`; `webClips(edl)`;
`staleWebClips(edl)`. `updateClip` cannot change `web`, nor a web clip's
`sourceFile`.

## Zoom

Zooming is not recorded. It is ordinary transform keyframes on the clip,
made from the track by `zoomKeyframes(track, frame, options)`
(`src/utils/web/zoom.js`, pure): for every `focus` step — and, with
`options.clicks`, every click — the picture scales up about the target's
rectangle during the step's `duration`, holds, and eases back before the
next step that needs the whole page. `applyWebZoom(edl, clipId, track,
options)` writes them (`transform.scaleX`, `scaleY`, `x`, `y`) and
`clearWebZoom` removes them. They can then be moved, re-eased or deleted
like any other keyframes.

Options: `clicks` (off), `margin` (0.35 of the target's size, on every
side), `fill` (the target takes at most 0.6 of the frame), `maxZoom` (2.2;
a step's own `zoom`, up to 8, overrides the fit), `release` (0.6 s), `join`
(two zooms closer than 1.5 s glide into each other without zooming out).
The picture is never moved so far that the frame's edge shows, and a
target too large to zoom is still panned into view. The maths assumes the
clip is neither cropped nor rotated.

## Server

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/web/status` | `{ available, browser: { path, version }, reason, allow: [] }`; `?fresh` looks again |
| POST | `/web/snapshot` | `{ recipe, until?, projectId? }` → the page after the first `until` steps (default: all): `{ url, title, viewport, page: { width, height }, scrollY, image, elements, warnings }` |
| POST | `/web/record` | `{ projectId, recipe, fps? }` → `202 { jobId }`; job type `web`, result `{ file, key, duration, fps, width, height, title, track, cached }` |
| GET | `/web/track?projectId=&key=` | The track of a recording |

`elements` is what a person or the director can aim at — links, buttons,
form controls, headings, images and landmark sections, at most 300:
`{ kind, name, target, rect: { x, y, width, height }, visible }`, with
`rect` in page CSS pixels and `target` a string that finds exactly that
element. `image` is a PNG data URL of the viewport.

A browser is found in this order: `WEB_CAPTURE_BROWSER` (when set, only
that one is tried), the copy `npm run install-browser` puts in the data
folder, then Playwright's and Puppeteer's caches. It must be **chrome-headless-shell**: ordinary Chrome
has no begin-frame control. Without one, `/web/status` says so and how to
get it; nothing else in NearEdit is affected.

```bash
npm run install-browser
```

In Docker, build the image with `--build-arg WEB_CAPTURE=1` to include the
browser; there it runs without Chrome's own sandbox and relies on the
container.

### What the browser may load

A recording browser on the server could otherwise be pointed at whatever
the server can reach. So:

- Only `http:` and `https:` pages. Never `file:`.
- **Private addresses are refused** — loopback, RFC 1918, link-local
  (including cloud metadata addresses), CGNAT, unique-local IPv6 — for the
  page itself and for everything it loads: frames, images, requests, web
  sockets, workers. `WEB_CAPTURE_ALLOW` lists exceptions:
  `localhost:5173,*.staging.example.com`.
- The browser's only way out is a small proxy inside NearEdit
  (`src/api/web/proxy.js`): it resolves each name itself, checks the
  address, and connects to the address it checked, so a name cannot answer
  differently a moment later. The browser cannot resolve names or open
  connections of its own. The price: the system's proxy settings are not
  used, so a site reachable only through a corporate proxy cannot be
  recorded.
- A fresh, empty browser profile for every recording; downloads, extra
  permissions and service workers off; the Chrome sandbox on unless
  `WEB_CAPTURE_NO_SANDBOX=1`.
- Limits: 10 minutes and 200 steps per recording, 60 s to load a page, one
  recording at a time (`WEB_CAPTURE_CONCURRENCY`).

## Command line

```bash
nearedit record recipe.json -o demo.mp4          # one recipe → demo.mp4 and demo.track.json
nearedit render timeline.json                    # records its web clips first, then renders
```

`render` and `frame` record any web clip whose recording is missing into
`.nearedit/web/` beside the document; the document itself is not rewritten.
All three take `--allow host[:port]` for private addresses, like
`WEB_CAPTURE_ALLOW`. `validate` reports recipe problems with their place
and lists unrecorded clips.

## Limits

- Needs `chrome-headless-shell`; begin-frame control is an experimental
  part of the DevTools protocol.
- `<video>`, WebGL and `<canvas>` animations driven by their own clocks
  are not stepped with the page and may stutter or freeze. No sound.
- Native pop-ups (a `<select>` list, a file chooser, an alert) are not
  drawn; `select` sets the value directly, alerts are dismissed. A link
  that opens a new tab is not followed. Targets inside frames and shadow
  roots are not found. Pages asking for an HTTP password cannot be recorded.
- Verified on Linux against local pages only: public sites, macOS, Windows
  and the sandboxed launch have not been exercised.
- Two recordings of one recipe show the same thing but are not guaranteed
  to be identical to the bit; the recording that exists is the one used.
- A recipe is replayed from a fresh profile every time: it must reach the
  state it shows by itself (or through `storage`).
