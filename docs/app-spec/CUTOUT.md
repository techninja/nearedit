# Person Cutout — Yourself Without Your Background

The thing meeting software does to a webcam, as an edit: take a clip of a
person filmed anywhere — a desk, a kitchen, a handheld selfie — and keep
only the person, so they can speak over another video, a slide, a web
recording or a generated background. It is a best guess made by a small
neural network, and it looks like one around hair and fast hands; people
use it anyway, because it removes the need for a studio.

```text
clip with cutout on ─► job: decode the frames the clip uses ─► matte model (a worker
process) ─► a cutout file: every frame with its matte beside it ─► the compositor
draws the picture through the matte — in the preview and in the render alike
```

**Why a file and not a live effect.** A model fast enough to run on every
preview frame is a worse model, would need a second implementation on the
server, and would not give the same pixels twice. Making the matte once,
as a background job, lets a better model take its time; the preview and
the render then read the same file, so what is seen is what is rendered,
and playback costs no more than playing a video. The same pattern as
[web clips](./WEBCLIP.md) and [music clips](./MUSIC.md).

## In the document

On a video clip:

```json
{ "sourceFile": "/project/selfie.mp4", "sourceIn": 4, "sourceOut": 19,
  "cutout": { "on": true, "mode": "remove", "feather": 0.4, "shrink": 0.3, "blur": 3,
    "made": { "file": "/project/.nearedit/cutout/0a51bd39df6c629f93d1.mp4",
      "key": "0a51bd39df6c629f93d1", "source": "/project/selfie.mp4",
      "start": 3, "end": 20, "fps": 30, "width": 1280, "height": 720, "frames": 510 } } }
```

| Field | Default | Notes |
| ----- | ------- | ----- |
| `on` | false | Draw the clip through its matte |
| `mode` | `remove` | `remove` the background, or `blur` it and keep the person sharp |
| `feather` | 0.4 | Softness of the edge: the width of its ramp, in units |
| `shrink` | 0.3 | Pull the edge in (positive) or let it out (negative), in units — hides a fringe of background |
| `blur` | 3 | For `mode: blur`: how soft the background is, in units |
| `made` | — | The cutout file made for the clip: what a finished `cutout` job answered |

**Units** are hundredths of the shorter side of the clip's own picture, so
an edge keeps its look when the clip is scaled, and one setting suits a
720p and a 4K source alike. For a picture that fills the frame they are
the document's units.

Nothing else changes about the clip: its transform, crop, effects and
keyframes apply to the cut-out picture as to any other. A drop shadow
follows the person's shape; [`outline`](./EFFECTS.md#outline) draws a
sticker's border around it. With `on` false the clip plays its file as
before, and keeps its settings and `made` for when it is switched on again.

**`made`** is how a clip remembers its cutout, the way a web clip
remembers its recording: where the file is, which media file it was cut
out of (`source`), the stretch it holds, and its rate, size and frame
count — enough to play the right frame without asking a server. A block is
kept only where it says something (on, a setting that is not the default,
or a `made`); the field exists only on clips that play a video file.

Where a clip stands follows from the document alone:

| `cutoutState(clip, fps)` | Means | Drawn as |
| ------------------------ | ----- | -------- |
| `off` | `on` is false | The clip's file |
| `missing` | Nothing made for the file the clip plays now | The clip's file |
| `stale` | Made, but it no longer covers what the clip plays — the clip was trimmed or slipped beyond it — or it was made at another frame rate than `fps` | The cutout where it reaches (preview); the clip's file (render) |
| `ready` | Made, and it covers the clip's source window | The person alone |

Without `fps` a cutout made at another rate counts as ready; give the
document's rate to agree with `cutoutNeeds`. A file that changed on disk
is not seen here: asking the server again finds it (the key differs).

The operations, from `#utils/edl/index.js`
([EDL-OPERATIONS.md](./EDL-OPERATIONS.md#person-cutout)):

- `setCutout(edl, clipIds, patch)` — switch on or off and change settings,
  one undo step for any number of clips.
- `attachCutout(edl, made)` — give a finished job's result to every clip
  with cutout on that plays `made.source` and is covered by it. **The
  result must name `source`**; one without it attaches nothing. Clips that
  play the same file share one cutout, and the newest wins.
- `cutoutNeeds(edl)` — what to ask the server for: the ranges of
  `cutoutRanges(edl)` in which a clip is not `ready`.
- `cutoutState(clip, fps?)`, `canCutout(clip, track)`.

Split, trim, slip, copy and paste carry the block with the clip: both
halves of a split clip keep the same cutout, and a trim beyond it makes
the clip `stale` until the rest is made.

## The cutout file

One per media file and the stretch of it the timeline uses:

```text
<project>/.nearedit/cutout/<key>.mp4    H.264: the picture on the left, its matte on the right
<project>/.nearedit/cutout/<key>.json   { version, key, source: { path, size, mtime },
                                          start, end, fps, width, height, frames, model }
```

- **Range.** One cutout covers every clip of the document that plays that
  file with cutout on, from the earliest frame used to the latest, with a
  second of margin each side: `cutoutRanges(edl)` gives the ranges, and the
  editor asks the server for them — the server cuts out the range it is
  given and does not read the document. Trim a clip beyond its cutout and
  it is *out of date* until the rest has been made (`coversClip(meta,
  clip)`); a longer cutout already on disk is reused. At most 30 minutes.
- **Frames.** Frame *n* of the cutout is the frame the render would show at
  `start + n / fps`, chosen by the renderer's own frame rules, so picture
  and matte are one image and can never drift apart.
  `cutoutTime(meta, sourceTime)` gives the frame to show for a moment of
  the source. A range past the end of the file holds the last frame.
- **Key**: 20 hex digits of the SHA-256 of the file's identity (path, size,
  modification time), the first frame and the number of frames, the frame
  rate, and the model with its settings. `cutoutKey(...)` — the same in the
  browser and on the server.
- **Picture.** The source as shown (rotation applied, square pixels),
  fitted into 1920 × 1080, so the file is at most 3840 wide. The matte is
  grey, white where the person is, slightly smoothed. H.264 at a quality
  that keeps the picture within sight of the source (about 45 dB at 720p),
  5–9 Mbit/s, a key frame every half second so that it seeks quickly. A
  source in BT.601 colour stays so.
- A cutout is written beside its final name and renamed when complete, so
  a cancelled or failed job leaves nothing that looks finished. Old
  cutouts are not removed by themselves.

The pure half is `src/utils/cutout/`: `normalizeCutout`, `CUTOUT_FIELDS`
(the settings), `cleanCutout`, `cleanMade` (the block a clip keeps),
`cutoutRanges`, `cutoutKey`, `coversClip`, `cutoutTime`, and for hosts
`cutoutShown(clip, sourceTime)` — the frame of its cutout file a clip
shows at a moment, or nothing when its own file is to be shown.

## The matte model

A **worker process** that reads frames and writes mattes, started by the
server like the transcriber:

```text
stdin:  raw RGB frames, width × height × 3 bytes each
stdout: raw 8-bit mattes, width × height bytes each (255 = person)
args:   --width --height --fps, and whatever the provider needs
```

Exactly one matte for every frame, in order, and nothing else on stdout;
an answer may come late (a network that looks ahead), the program exits
with 0 when its input ends, and it is given up on after three minutes of
silence.

- **Built in**: `workers/person_matte.py` — Python with `onnxruntime` and
  `numpy`, running a portrait-matting network in ONNX form (MODNet, Apache
  2.0, 26 MB). It works on a reduced copy of each frame (512 on the long
  side) and returns the matte at full size. A matte flickers where the
  network is unsure, so it is steadied — but only where the picture itself
  did not change, which leaves no trail behind a moving person. Measured on
  4 shared CPU cores: about 10 frames a second for 1280 × 720 and 8 for
  1920 × 1080 — a minute of footage in three to four minutes.
- `npm run install-cutout` downloads the model into `<data>/models/` and
  says whether the Python it will use has what it needs. NearEdit never
  downloads anything by itself.
- **Your own**: `CUTOUT_COMMAND` names any program that speaks the protocol
  above — another network, a GPU, a service.

| Setting | Default | |
| ------- | ------- | --- |
| `CUTOUT_PYTHON` | `FASTER_WHISPER_PYTHON`, else `python3` | Python with `onnxruntime` and `numpy` |
| `CUTOUT_MODEL` | `<data>/models/modnet.onnx`, else NearEdit's own `data/models/` | The ONNX matting model |
| `CUTOUT_COMMAND` | — | A matte program of your own, used instead of the built-in one |
| `CUTOUT_CONCURRENCY` | 1 | Cutout jobs at a time |

Without a model or a suitable Python, `GET /cutout/status` says what is
missing and how to get it; everything else in NearEdit is unaffected.

## Server

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/cutout/status` | `{ available, provider, model, reason, … }` — `provider` is `builtin` or `command`, `model` names what makes the matte (it is part of every key), `reason` says what is missing and the command that gets it |
| POST | `/cutout` | `{ projectId, path, start, end, fps }` → `202 { jobId }`; job type `cutout`, progress `frame n of m`, result `{ file, key, source, start, end, fps, width, height, frames, cached }` — `source` is the media file, so the result is what `attachCutout` takes |
| GET | `/cutout/meta?projectId=&key=` | The description of a finished cutout |

`POST /cutout` refuses before a job exists what cannot work: a still or a
sound file, a range that is empty or longer than 30 minutes (`422` with
`fields`), a file outside the allowed folders (`403`), and — with the
status reason — a server that has no matte program (`503`). The details
are in [API.md](./API.md).

A render job makes no cutouts by itself — it takes minutes, not
milliseconds: the export dialog says which clips are waiting and offers to
make them first, as it does for web clips.

## Drawing

One compositor draws the cutout in the preview and in the render
([COMPOSITOR.md](./COMPOSITOR.md#the-matte-pass)), so both show the same
pixels: the parity suite draws 20 cutout documents — every mode, the
extremes of feather and shrink, under a transform and a crop, with a
shadow and an outline, over footage and over a generator, wide, tall and
square — on the server canvas and in Chromium, and no channel of any
pixel differs.

- **The frame.** For a clip with cutout on and something made, the host
  hands over (`env.frameOf`) a frame of the cutout file: the picture on
  the left, its matte on the right. The compositor knows such a packed
  frame by its shape — twice as wide for its height as the picture — and
  draws any other frame as the plain picture. So a host may hand over
  whichever it has: the plain picture until the cutout is there, where a
  stale cutout does not reach, or when the file cannot be loaded.
- **The matte pass** (`cutoutPass.js`) takes the left half through the
  brightness of the right half and places the result like any picture.
  It works at the size the clip is drawn at — never above the size of what
  was handed over — and reads the matte, the one thing looked at pixel by
  pixel, at half or a quarter of that where the edge is soft enough.
- **The edge** (`matteEdge.js`). A matte's edge is a ramp, and its greys
  say how far a pixel is from the edge. A table look-up reads each grey as
  that distance, moves the edge by `shrink`, and draws the ramp again as
  wide as `feather` asks; black stays clear and white solid whatever the
  settings. When the edge has to become softer than the matte is, or move
  further than its ramp reaches, the matte is blurred first — by a blur
  that is measured, since a software canvas does not blur by what it is
  asked (nothing at all under 0.8 px). `shrink` moves an edge as soft as
  the model's own by the distance asked, within a few percent, at any
  size; where the model was less sure — hair — the ramp is wider and the
  edge moves further, which is where a fringe sits.
- **`mode: blur`** draws the whole picture blurred by `blur` first and
  the person, sharp, on top: an opaque picture again.
- **Cost** per frame, measured (4 shared cores, under load from other
  work; the plain picture beside it for scale):

  | Drawn at | Cutout file | Plain | Cut out | `blur` mode | 40 % in a corner |
  | -------- | ----------- | ----- | ------- | ----------- | ---------------- |
  | Server canvas, 1920 × 1080 | 1280 × 720 | 7.2 ms | +5.2 ms | +14 ms | +0 ms |
  | Server canvas, 1920 × 1080 | 1920 × 1080 | 4.4 ms | +15 ms | +41 ms | +3.7 ms |
  | Server canvas, 769 × 433 | 1280 × 720 | 1.4 ms | +3.0 ms | +6.9 ms | +0 ms |
  | Chromium, 769 × 433 (the preview) | 1280 × 720 | 1.1 ms | +5.2 ms | +8.5 ms | +0 ms |
  | Chromium, 1920 × 1080 | 1280 × 720 | 6.4 ms | +9.6 ms | +16 ms | +0 ms |

  Chromium was headless, drawing in software, from a `<video>` element.

**The preview** (`playback/pictureSource.js`) plays the cutout file in
place of the clip's own for the picture — sound still comes from the
clip's file — seeking a paused element to the middle of the frame
`cutoutShown` names and keeping a playing one on the cutout's own clock
(`sourceTime − made.start`). Until a cutout is attached the plain picture
shows; attaching it is an edit like any other, so the preview changes
without a reload. A cutout file that fails to load falls back to the
clip's file and is tried again after ten seconds. The selection box goes
round the picture, not the packed frame.

**The render** ([RENDER.md](./RENDER.md#person-cutout)): a segment with a
ready cutout takes the canvas path (reason `cutout`) and its frame worker
decodes the cutout file for that clip. A clip whose cutout is missing or
out of date renders its plain picture, and the job says so in a warning.

## Command line

```bash
nearedit cutout edit.json     # make the cutouts the document still lacks
nearedit validate edit.json   # says which clips have none
nearedit frame edit.json --time 3 && nearedit render edit.json
```

A document names what it wants — `"cutout": { "on": true }` on a clip —
and needs no `made`: loading it looks in `.nearedit/cutout/` beside the
document and in every `--media` folder for a cutout that holds what the
clip plays, at the document's frame rate, whatever model made it.
`validate`, `frame` and `render` draw through what is found and warn for
each clip that has none (`person cutout not made yet`): it is drawn with
its background. `nearedit cutout <edl.json>` makes the missing ones with
the server's own pipeline — one per media file, for the stretch its clips
use with a second of margin — into `.nearedit/cutout/` beside the
document, and prints each file's path. It needs the matte program
(`CUTOUT_PYTHON`, `CUTOUT_MODEL`, or `CUTOUT_COMMAND`) and says what is
missing when there is none; `render` and `frame` never make a cutout
themselves.

## In the editor

Select footage on a video track and the inspector shows **Cut out
person** (not for stills, titles, generators, sound or web recordings).
The command *Cut out person* (`Alt+P`, `cutout.toggle`) switches it for the
selection and opens the inspector; *Make all missing cutouts*
(`cutout.makeAll`) retries whatever is held up. The interface is
`src/utils/cutoutUi/` with `<cutout-inspector>`, `<cutout-place>` and
`<cutout-watch>`.

**The switch** sets `cutout.on` on every selected clip that can be cut
out — one undo step. Nothing else is needed: the editor then keeps the
cutouts made.

**Making them.** While the editor is open, `<cutout-watch>` compares what
the document needs (`cutoutNeeds`) with what is under way:

- It looks 600 ms after the document last changed, and never during a
  drag: trimming starts no job until the trim has ended.
- One request for each media file, never two at once for one file. A
  request that no longer covers what is needed — a clip was trimmed past
  it, another clip of the file was switched on — is cancelled and replaced
  by one for the whole stretch; one that nothing needs any more is
  cancelled.
- A finished cutout is attached with `attachCutout` and committed without
  an undo step: undo steps over it, redo keeps it.
- A cutout that already exists costs one request (`cached`). A job for
  the file that is already running — the page was reloaded — is followed
  instead of started again; cutouts finished by other jobs of the project
  are attached too. Leaving the editor cancels nothing.

| The inspector says | Timeline badge | What can be done |
| ------------------ | -------------- | ---------------- |
| Starting… / Waiting for its turn… | `Cutout…` (busy) | Cancel |
| Making the cutout — frame *n* of *m*, with a bar | `Cutout 40%` (busy) | Cancel |
| The person is cut out | `Cutout` (on) | |
| Making the rest — … (out of date: the made part keeps playing) | `Cutout 40%` (busy) | Cancel |
| Failed — the server's reason; also a toast | `Cutout !` (warn) | Try again |
| Cancelled | `Cutout !` (warn) | Make it |
| This server cannot make cutouts | `Cutout !` (warn) | Check again |

What failed, was cancelled or cannot be made is not asked for again by
itself — only on the button, or when the stretch that is needed changes.
When `GET /cutout/status` says there is no matte program, the group shows
the server's `reason` and `npm run install-cutout` whether or not the
switch is on; *Check again* asks with `?fresh`. A cutout that took real
time ends with a toast (a desktop notification in a hidden tab).

**Settings**, for all selected clips, live: *Background* — Remove or Blur —
*Edge softness*, *Edge shrink* and, for Blur, *Background blur*. Lengths
show as % of the clip's own picture's shorter side, so an edge keeps its
look when the clip is scaled. Dragging a
slider is one undo step.

**Place** — seven buttons, each one edit of the transform (so the clip can
be adjusted by hand afterwards). The person is taken to be in the middle
of their picture; rotation, crop, pan and zoom and transform keyframes are
cleared. The button of the placement a clip is in is lit.

| Placement | Writes |
| --------- | ------ |
| Fill the frame | `fit: cover`, no offset, scale 1 |
| Full height, left / right | `fit: contain`, as tall as the frame, its middle a quarter in from the side |
| Lower left / right corner | half the frame's height, standing on the bottom edge |
| Circle, lower left / right | a round window, 30 % of the frame's shorter side: a `mask` effect (id `cutout-circle`) put before `outline`, `dropShadow` and `glow`, the picture scaled to cover it |

**Finish** — *Shadow* and *Outline* add or remove a `dropShadow` (soft,
below right, scaled to the frame) and an `outline` effect, the outline
before the shadow; their settings are in the effect stack below.

**Export.** While clips wait for a cutout the export dialog names them,
says that they would render with their background, shows the progress or
the reason, and offers to make first what is held up (or, without a matte
program, to check again).

## Limits

- A best guess: hair, fingers, fast motion, a second person, objects held
  up to the camera and backgrounds the colour of clothes all go wrong
  sometimes. Edge controls hide a little; they do not fix a wrong guess.
- Tried on real camera footage now (a person with long hair talking, 21 s,
  1280 × 720) besides a photograph moved over test pictures: the edge is
  clean, hair included. What was seen go wrong: a held object (a helmet)
  drops out for some frames; a shot with no person in it can keep a
  random patch for a second; and with no `shrink` at all, footage with a
  light backdrop keeps a pale rim and stray wisps beside the hair when it
  is put over something dark — the default of 0.3 is what hides them.
- `shrink` moves the edge by reading the matte's ramp, so it moves a soft
  edge further than a hard one, and it is exact only for an edge as soft
  as the built-in model's. A matte program of your own with harder edges
  needs larger values.
- Slow next to playing a video — minutes per minute of footage on a CPU.
- Video clips only; a still is not cut out.
- A stale cutout plays where it reaches in the preview but not in a
  render; a cutout made at another frame rate is stale. While a clip
  changes from its file to its cutout during playback, a few frames show
  neither.
- A clip remembers its cutout by the path of the file: a project folder
  that was moved finds its cutouts again by asking the server (they are
  made again when the media's path changed, since the key holds it).
- Needs Python with `onnxruntime`, and the model file; the Docker image
  has neither yet.
