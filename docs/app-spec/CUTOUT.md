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
<project>/.nearedit/cutout/<key>.json   { source, start, end, fps, width, height, frames, model }
```

- **Range.** The job covers every clip of the document that plays that
  file with cutout on, from the earliest frame used to the latest, with a
  second of margin each side. Trim a clip beyond that and it is *out of
  date* until the rest has been made; the part that exists keeps playing.
- **Frames.** Frame *n* of the cutout is the frame the render would show at
  `start + n / fps`, chosen by the renderer's own frame rules, so picture
  and matte are one image and can never drift apart.
- **Key**: 20 hex digits of the SHA-256 of the file's identity (path, size,
  modification time), the range, the frame rate, the model and its
  settings. `cutoutKey(...)`.
- Pictures taller than 1080 are reduced to 1080 in the cutout.

## The matte model

A **worker process** that reads frames and writes mattes, started by the
server like the transcriber:

```text
stdin:  raw RGB frames, width × height × 3 bytes each
stdout: raw 8-bit mattes, width × height bytes each (255 = person)
args:   --width --height --fps, and whatever the provider needs
```

- **Built in**: `workers/person_matte.py` — Python with `onnxruntime` and
  `numpy`, running a portrait-matting network in ONNX form (MODNet, Apache
  2.0, 26 MB). It works on a reduced copy of each frame (512 on the long
  side), steadies the matte a little from frame to frame, and returns it at
  full size. Measured on 4 shared CPU cores: about 12 frames a second for
  1280 × 720 — a minute of footage in about two and a half.
- `npm run install-cutout` downloads the model into `<data>/models/` and
  says whether the Python it will use has what it needs. NearEdit never
  downloads anything by itself.
- **Your own**: `CUTOUT_COMMAND` names any program that speaks the protocol
  above — another network, a GPU, a service.

| Setting | Default | |
| ------- | ------- | --- |
| `CUTOUT_PYTHON` | `FASTER_WHISPER_PYTHON`, else `python3` | Python with `onnxruntime` and `numpy` |
| `CUTOUT_MODEL` | `<data>/models/modnet.onnx` | The ONNX matting model |
| `CUTOUT_COMMAND` | — | A matte program of your own, used instead of the built-in one |
| `CUTOUT_CONCURRENCY` | 1 | Cutout jobs at a time |

Without a model or a suitable Python, `GET /cutout/status` says what is
missing and how to get it; everything else in NearEdit is unaffected.

## Server

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/cutout/status` | `{ available, provider, model, reason }` |
| POST | `/cutout` | `{ projectId, path, start, end, fps }` → `202 { jobId }`; job type `cutout`, result `{ file, key, start, end, fps, width, height, frames, cached }` |

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
- Needs Python with `onnxruntime`, and the model file.
