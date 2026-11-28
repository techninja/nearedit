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
  "cutout": { "on": true, "mode": "remove", "feather": 0.4, "shrink": 0.1 } }
```

| Field | Default | Notes |
| ----- | ------- | ----- |
| `on` | false | Draw the clip through its matte |
| `mode` | `remove` | `remove` the background, or `blur` it and keep the person sharp |
| `feather` | 0.4 | Softness of the edge, in units (hundredths of the frame's shorter side) |
| `shrink` | 0.1 | Pull the edge in (positive) or let it out (negative), in units — hides a fringe of background |
| `blur` | 3 | For `mode: blur`: how soft the background is, in units |

Nothing else changes about the clip: its transform, crop, effects and
keyframes apply to the cut-out picture as to any other. A drop shadow
follows the person's shape; `outline` draws a sticker's border around it.
With `on` false the clip plays its file as before.

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

The pure half is `src/utils/cutout/` (`normalizeCutout`, `CUTOUT_FIELDS`,
`cutoutRanges`, `cutoutKey`, `coversClip`, `cutoutTime`).

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
| POST | `/cutout` | `{ projectId, path, start, end, fps }` → `202 { jobId }`; job type `cutout`, progress `frame n of m`, result `{ file, key, start, end, fps, width, height, frames, cached }` |
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

The host hands the compositor the cutout's frame for such a clip instead
of the file's (`env.frameOf`). The compositor takes the left half as the
picture and the brightness of the right half as its transparency, shaped
by `feather` and `shrink`, and from there the clip is a layer like any
other. `mode: blur` draws the whole picture blurred underneath first. A
clip whose cutout is not made yet draws its plain picture, with a mark in
the timeline. A segment with a cutout clip is rendered by the compositor.

## In the editor

The inspector of a video clip has **Cut out person**: switching it on
starts the job (progress on the clip and in the job tray) and the picture
changes when it is done. With it: edge softness and shrink, remove or
blur, and one-click placements for the usual uses — full height at one
side, a circle in a corner — plus a shadow and an outline.

## Limits

- A best guess: hair, fingers, fast motion, a second person, objects held
  up to the camera and backgrounds the colour of clothes all go wrong
  sometimes. Edge controls hide a little; they do not fix a wrong guess.
- Slow next to playing a video — minutes per minute of footage on a CPU.
- Video clips only; a still is not cut out.
- Needs Python with `onnxruntime`, and the model file; the Docker image
  has neither yet.
- So far tried on a photograph of a person moved over test pictures, not
  on real camera footage.
