# NearEdit HTTP + WebSocket API

All routes are mounted under `/api`. Bodies and responses are JSON unless
noted. Errors are `{ "error": "message", "detail"?: "...", "fields"?: {} }`
with a meaningful status (400 bad input, 403 path not allowed, 404 missing,
409 wrong state, 422 failed validation, 500 unexpected, 503 provider not
configured or unreachable).

Long work never blocks a request: it starts a **job** and answers
`202 { "jobId": "..." }`. Progress arrives over the WebSocket.

When `NEAREDIT_PASSWORD` is set, every route (and the WebSocket handshake)
answers `401` with a Basic challenge until credentials are sent; see
[CONFIGURATION.md](./CONFIGURATION.md#access-and-security).

**File paths.** Media is addressed by absolute path. Every path taken from a
request is checked with `lib/paths.js` — it must sit inside a registered
project directory, one of its `mediaFolders`, a global media path, the dev
`media/` directory, or the server data directory. Anything else is `403`.

## Projects

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/projects` | `{ data: Project[], total }` |
| POST | `/projects` | `{ name, path }` → `201 Project`. `path` is absolute and inside `BROWSE_ROOTS`; the folder is created when missing. A folder that already holds `.nearedit/project.json` is re-registered, not overwritten (`name` optional then) |
| GET | `/projects/:id` | Project with `adaptations[]` (without their EDLs) |
| PUT | `/projects/:id` | Shallow-merge update of `name`, `description`, `mediaFolders`, `status`. New `mediaFolders` must exist and lie inside `BROWSE_ROOTS` (403 otherwise) |
| DELETE | `/projects/:id` | Unregister only. Never deletes files |
| POST | `/projects/:id/adaptations` | `{ name, aspectRatio, resolution?, fps?, parentAdaptationId?, copyFrom? }` → `201 Adaptation`. Without `resolution` one is derived from the aspect ratio. `copyFrom` deep-copies that adaptation's EDL |
| PUT | `/projects/:id/adaptations/:aid` | Update name, aspectRatio, resolution, fps, status |
| DELETE | `/projects/:id/adaptations/:aid` | Children are re-parented to the deleted one's parent. The last adaptation cannot be deleted (409) |
| GET | `/projects/:id/edl/:aid` | The adaptation's EDL (normalised to v3) |
| PUT | `/projects/:id/edl/:aid` | Replace the EDL → `{ ok, adaptationId, updatedAt }`. The document is normalised, then validated (422 with `fields` when it still breaks an invariant). A changed `fps` or `resolution` is written through to the adaptation |

A project is `{ id, name, description, status, path, available,
mediaFolders, adaptations, createdAt, updatedAt }`; `available` is false
when its folder cannot be reached. An adaptation is `{ id, projectId,
parentAdaptationId, name, aspectRatio, resolution, fps, status, createdAt,
updatedAt }`.

## Media

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/media?projectId=` | `{ data: MediaItem[], total }` |
| GET | `/media/file?path=` | Stream a file (HTTP range supported) |
| GET | `/sidecar?path=` | The fresh sidecar, or `{ exists: false, stale }` |
| PUT | `/sidecar?path=` | Merge a patch into the sidecar (user edits to tags, transcript) and return it. Known fields are shape-checked (422) |
| GET | `/previews/thumbnail?path=&cols=10&height=90` | JPEG filmstrip of `cols` (1–40) frames, `height` 16–360 |
| GET | `/previews/frame?path=&time=&height=` | One JPEG frame |
| GET | `/previews/waveform?path=` | `200 { peaks, samples, duration, peaksPerSecond }` or `202 { status: "generating", jobId }` (the `waveform` job completes with `result.path`). A file without sound answers 200 with empty peaks |
| GET | `/transcode?path=` | WAV rendition of a compressed audio file, for sample-accurate seeking |
| GET | `/index/search?q=&projectId=` | Search filenames, tags and transcripts |

```json
{
  "filename": "park.mp4", "filePath": "/abs/park.mp4", "relativePath": "day1/park.mp4",
  "type": "video", "global": false, "size": 1234567, "mtime": 1715000000000,
  "duration": 14.08, "width": 3840, "height": 2160, "fps": 60, "rotation": 0,
  "hasAudio": true,
  "indexed": true, "tags": ["park", "dog"],
  "analysis": { "transcript": true, "tags": true, "beats": false, "scenes": true, "silences": true }
}
```

`type` is `video`, `audio`, `image` or `text`. Fields that do not apply are
`null` (a still has no duration, audio has no size). Metadata comes from the
sidecar when the file is indexed, otherwise from a probe cached in memory —
so the first listing of a large un-indexed folder is slow; index it once.

Search results are `{ filename, filePath, relativePath, type, global,
duration, score, matchCount, matches: [{ field, text, start?, end?, time? }] }`.

## Folder browser

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/browse?path=` | `{ path, parent, roots, hasProject, dirs: [{ name, path, hasProject }] }`. No `path` = first browse root. Restricted to `BROWSE_ROOTS`; dot-folders are hidden |
| POST | `/browse/mkdir` | `{ path, name }` → `201 { path }` (409 when taken, 422 for an unsafe name) |
| POST | `/pick-folder` | Native OS dialog → `{ path, browsable }` when the server has a desktop and the request comes from that machine; `204` otherwise |

## Jobs

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/jobs?projectId=` | `{ data: JobSummary[], total }`, newest first |
| GET | `/jobs/:id` | JobSummary |
| GET | `/jobs/:id/result` | Full result (409 until complete) |
| DELETE | `/jobs/:id` | Cancel a queued/running job, or drop a finished one |

```json
{
  "id": "uuid", "type": "render", "status": "running", "projectId": "…",
  "label": "Render: Main Edit", "progress": 42, "error": "",
  "log": ["last", "five", "lines"], "createdAt": 0, "updatedAt": 0,
  "hasResult": false, "result": {}
}
```

`status`: `queued`, `running`, `complete`, `error`, `cancelled`.
`type`: `index`, `analyze`, `transcribe`, `tag`, `beats`, `scenes`,
`silence`, `waveform`, `director`, `script`, `render`, `web`, `cutout`.
`result` in a summary holds only the small scalar fields of the full result.

### WebSocket `/ws`

Only pages served by this server may connect (the handshake `Origin` must
match the host). Server → client messages:

```json
{ "type": "connected" }
{ "type": "job_update", "job": { "…JobSummary": "" } }
```

## Intelligence

Analysis results are written to each file's sidecar. Every route below
answers `202 { jobId }`.

| Method | Route | Body |
| ------ | ----- | ---- |
| POST | `/intelligence/analyze` | `{ projectId, paths?, steps?, force? }` — runs steps over many files in one job |
| POST | `/intelligence/transcribe` | `{ filePath, language?, force? }` |
| POST | `/intelligence/tag` | `{ filePath, frames?, force? }` |
| POST | `/intelligence/beats` | `{ filePath, force? }` |
| POST | `/intelligence/scenes` | `{ filePath, threshold?, force? }` |
| POST | `/intelligence/silence` | `{ filePath, noiseDb?, minDuration?, force? }` |
| POST | `/index` | `{ projectId }` — alias of analyze with `steps: ["probe"]` |

`steps` is any of `probe`, `transcribe`, `tags`, `beats`, `scenes`,
`silence`. Default: every step that suits the file type. They run in the
order probe → silence → scenes → beats → transcribe → tags, because scenes
feed frame selection and silences feed upload chunking. Steps already
present in a fresh sidecar are skipped unless `force` (or unless an option
such as `threshold` or `language` differs from the one it was built with).

An `analyze` job's result is `{ total, failed, files: [{ path, steps }] }`
where each step outcome is `"ok"`, `"skipped"`, `"skipped: <reason>"` (for
example a provider that is not set up) or `"error: <message>"`.

The single-step routes answer `400` when the step does not suit the file and
`503` when its provider is unusable, before any job is created; their job
result is `{ path, step, outcome, … }`. `/index` also accepts `paths` and
`force`. Setup and details: [INTELLIGENCE.md](./INTELLIGENCE.md).

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/intelligence/status` | Which providers are configured and reachable |
| GET | `/intelligence/transcript?path=&format=` | Export as `json`, `srt`, `vtt` or `txt`; `download=1` sends it as a file |

```json
{
  "ffmpeg": { "available": true, "detail": "6.1.1" },
  "transcription": { "provider": "whisper-cpp", "configured": "auto", "model": "base", "available": true, "detail": "" },
  "vision": { "provider": "ollama", "model": "llava:7b", "available": false, "detail": "connection refused" },
  "llm": { "provider": "ollama", "model": "qwen3:14b", "available": false, "detail": "" }
}
```

### Sidecar fields

Extends the sidecar described in `README.md`:

| Field | Type | Written by |
| ----- | ---- | ---------- |
| `duration`, `width`, `height`, `fps`, `codec`, `hasAudio`, `hasVideo`, `rotation`, `audioCodec`, `sampleRate`, `channels`, `size`, `bitrate` | probe | `probe` |
| `transcript` | `[{ word, start, end, probability }]` | `transcribe` |
| `segments` | `[{ id, start, end, text }]` | `transcribe` |
| `language`, `transcriptProvider` | string | `transcribe` |
| `tags`, `description` | string[], string | `tags` |
| `keyframes` | `[{ time, tags, description }]` | `tags` |
| `beats`, `bpm` | number[] (seconds), number | `beats` |
| `scenes` | `[{ start, end }]` shot boundaries | `scenes` |
| `silences` | `[{ start, end }]` | `silence` |
| `content`, `sections`, `wordCount` | text files only | `probe` |

## Director

The director turns intent into timeline edits. It never returns a whole
document — it returns a **DirectorResult** fragment that the client merges
with `applyDirectorResult` as a single undoable step. Action schemas, the
edit-plan format and the track layout it produces are described in
[DIRECTOR.md](./DIRECTOR.md).

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/director/actions` | `{ data: ActionSchema[] }` — drives the director form |
| POST | `/director` | `{ projectId, adaptationId, directive, edl }` → `202 { jobId }`; result is a DirectorResult |
| POST | `/director/script` | Same body → job result `{ scripts: [{ variant, filename, filePath, script }], count, folder, summary, notes }` |

```json
{
  "action": "generate_edit",
  "mode": "replace",
  "prompt": "60 second highlight reel of the kids at the park, cut to the beat",
  "params": { "duration": 60, "style": "energetic highlight reel" },
  "context": { "playheadPosition": 45.2, "range": { "start": 10, "end": 20 }, "selection": ["clip_1"] }
}
```

| Action | LLM | What it does |
| ------ | --- | ------------ |
| `base_edit` | no | Automatic rough cut from indexed media: speech with dead air removed, B-roll by scene, music cut on beats |
| `generate_edit` | yes | LLM writes an edit plan (segment picks), assembled deterministically on word/scene/beat boundaries |
| `generate_script` | yes | Markdown edit-script options to review first (`/director/script`) |
| `execute_script` | yes | Build the timeline from an approved script |
| `insert_broll` | optional | Find clips matching the prompt by tags/transcript and place them |
| `motion_piece` | optional | A title sequence built only from generated layers — backgrounds, particles, shapes, animated titles — from a few lines of text; no media ([DIRECTOR-MOTION.md](./DIRECTOR-MOTION.md)) |
| `site_demo` | optional | A demo of a web page from its address (`params.url`) and a few plain lines — or none, for a tour: the page is recorded as a web clip inside the job and framed with zooms, captions and a background ([DIRECTOR-WEB.md](./DIRECTOR-WEB.md)) |
| `score` | optional | Music written for the timeline by NearEdit's own synth — a style, a tempo that makes the span whole bars, sections on the markers, titles and cuts — rendered inside the job and added as one [music clip](./MUSIC.md), ducked under speech; needs the current `edl` ([DIRECTOR-SCORE.md](./DIRECTOR-SCORE.md)) |
| `remove_silence` | no | Tighten clips using word timestamps or detected silences |
| `beat_sync` | no | Move cuts onto the beats of a music clip |
| `add_captions` | optional | Captions for the speech on the timeline: switched on for the clips that speak and drawn word by word ([CAPTIONS.md](./CAPTIONS.md)), in a look read from the prompt — or, with `params.as: "phrases"`, title clips of readable phrases |
| `brand` | optional | "Apply brand": the project's brand kit on the open timeline — intro, outro, logo, names, stingers, caption style; idempotent ([DIRECTOR-BRAND.md](./DIRECTOR-BRAND.md)) |

`mode` says where the fragment goes: `replace` (whole timeline), `append`,
`prepend`, `insert` (ripple-insert at `context.playheadPosition`) or `range`
(replace `context.range`, rippling later clips by the length difference).

### DirectorResult

```json
{
  "mode": "insert",
  "at": 45.2,
  "range": { "start": 10, "end": 20 },
  "tracks": [
    { "type": "video", "index": 0, "name": "Video 1", "clips": [] },
    { "type": "audio", "index": 0, "name": "Audio 1", "clips": [] }
  ],
  "markers": [],
  "summary": "12 clips, 58.4s, cut on 124 BPM",
  "notes": ["2 picks had no word timestamps; cut on segment boundaries"],
  "plan": {}
}
```

Fragment clip times are **relative to the fragment start (0)**. `index` is
the Nth track of that `type` in the document (0 = first); missing tracks are
created. Clips are complete v3 clips (`createClip`). `range` is `null`
unless the mode is `range`; a result also carries its `duration`.
A result that follows the brand may carry `document` (font files, the caption style):
[DIRECTOR-BRAND.md § The result](./DIRECTOR-BRAND.md#the-result).

Actions that rewrite existing clips in place — `remove_silence`,
`beat_sync`, `add_captions`, `score`, and `insert_broll` with `placement: "overlay"`
— need the current `edl` in the request and always answer in `replace` mode
with the whole rewritten timeline. Their tracks carry the `trackId` of the
track they came from, and clips keep their ids, so the merge keeps track
settings and the selection. For these actions `directive.mode: "range"`
only limits which clips are touched.

LLM actions answer `503` straight away when the LLM provider is disabled or
unreachable; the other actions never depend on it.

## Render

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/render/presets` | `{ data: [{ id, label, description }] }` |
| POST | `/render` | `{ projectId, adaptationId, edl?, preset?, range?, filename? }` → `202 { jobId }`. Without `edl` the saved one is rendered |
| POST | `/render/plan` | Same body → `{ engine, args, filterComplex, duration, width, height, fps, inputs, files, warnings, segments }` without running (inspection, tests). Each segment has `engine` (`ffmpeg` or `canvas`) and `reasons` — why it needs the compositor |
| GET | `/renders?projectId=` | `{ data: [{ file, url, size, createdAt, projectId, adaptationId, preset, duration, width, height, fps, range }], total }` |
| GET | `/render/file/:name` | Stream a finished render (range supported); `?download` sends it as an attachment |
| DELETE | `/render/file/:name` | Delete a finished render |

Presets: `draft` (half resolution, fast), `standard` (default), `high`.
A `render` job's result is
`{ output, file, url, duration, size, width, height, fps }`. Cancelling the
job kills FFmpeg and removes the partial file.
With `subtitles: "srt" | "vtt"` in the body the timeline's captions are saved beside the video; the
result gains `subtitles`, `subtitlesUrl` and (always) `warnings` — [CAPTIONS.md](./CAPTIONS.md#in-a-render).
A clip whose person cutout is not ready renders with its background and adds a line to `warnings` —
[CUTOUT.md](./CUTOUT.md#drawing); the cutout job's result (below) is what `attachCutout` takes.

Every `sourceFile` in a posted EDL, and every image a generator or an
effect names (a particle sprite, for one), must pass the media allow-list
(403). An empty timeline, or one with only placeholders or muted tracks, is
a 422; so is a timeline that needs the compositor while the server runs
with `RENDER_ENGINE=ffmpeg`. An
existing render is never overwritten: a second "My Cut" becomes
`My Cut-2.mp4`. Long timelines are rendered in segments and joined without
re-encoding. How the graph is built, the presets and the limits:
[RENDER.md](./RENDER.md).

## Web clips

Scripted recordings of web pages ([WEBCLIP.md](./WEBCLIP.md)): a recipe —
an address and steps — is played in `chrome-headless-shell` and recorded
into `<project>/.nearedit/web/<key>.mp4`, with a track `<key>.json` beside
it. The recording is ordinary footage: it is played through `/media/file`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/web/status` | `{ available, browser: { path, version }, reason, allow }`. `?fresh` looks for the browser again |
| POST | `/web/snapshot` | `{ recipe, until?, fps?, projectId? }` → the page after the first `until` steps (default: all) |
| POST | `/web/record` | `{ projectId, recipe, fps? }` → `202 { jobId }`, job type `web` |
| GET | `/web/track?projectId=&key=` | The track of a recording (404 when there is none) |

`reason` says why recording is not possible and what to do — no browser
found, a browser that is not a headless shell, one that does not start —
and is `''` when `available`. `allow` lists the `WEB_CAPTURE_ALLOW`
patterns.

**Record.** `fps` is the frame rate of the document the clip lives in
(default 30): the recording's key is `recipeKey(recipe, fps)`, so a clip
recorded at another rate stays stale. The recipe is checked with
`validateRecipe` as it was sent: `422` with one entry per problem in
`fields` (`"steps[2].target": "click needs a target…"`), `400` without a
`projectId`, `404` for an unknown project, `403` / `404` for a
`recipe.storage` file outside the allowed folders or missing, `503` (with
the reason of `/web/status`) without a usable browser — all before a job
exists. Web jobs run in their own lane, `WEB_CAPTURE_CONCURRENCY` at a
time. Progress messages are `frame n of m`. The job's result:

```json
{
  "file": "/project/.nearedit/web/4f6cdd866ea702323a45.mp4",
  "key": "4f6cdd866ea702323a45", "duration": 9.5, "fps": 30,
  "width": 2560, "height": 1440, "title": "Example Domain",
  "track": { "version": 1, "steps": [], "cursor": [], "scroll": [], "warnings": [] },
  "cached": false
}
```

`duration` is the score's; `width` × `height` is viewport × scale, made
even. `cached` is true when the recording was already there — nothing is
recorded twice, and two requests for one key share one recording. A job
that fails names what stopped it: `Step 3 (click): nothing on the page
matches text=Sign in`, `Step 4 (click): css=#buy is covered by
<div#cookie-bar> "We use cookies"`, `https://intranet/ was refused: … is a private
address (private network). To record it anyway, allow it:
WEB_CAPTURE_ALLOW=intranet`. Cancelling the job ends the browser and
FFmpeg; a failed or cancelled recording leaves no file. What did not stop
the recording is in `track.warnings`: skipped steps (`onMissing: skip`),
parts of the page that were not loaded because their address is private,
requests that never finished, dialogs that were dismissed, an HTTP error
status of the page.

A step that aims at something scrolls it into place while the pointer
travels, and both are done when the pointer arrives: at the end of the
action, and for `type` at the end of its approach — half a second into
the step, however long the text. Only then is the target checked and
pressed, and no key of a `type` step goes out before its click; a `type`
without a target scrolls and checks nothing. What a step does on the
instant the clip ends, which no frame shows, is done all the same.

**Snapshot.** Answers directly (it takes about as long as loading the
page): `{ url, title, viewport, page: { width, height }, scrollY, image,
elements, warnings }`. The steps are played as a recording plays them —
same viewport and scale, same clock, the frame rate `fps` (the
document's, default 30) — so the first `until` steps can be done in a
snapshot exactly when they can in a recording, and what stops one stops
the other with the same message. The step after them is not tried:
`until: 3` is the page before the fourth step. `image` is a PNG data URL
of the viewport at one device pixel per CSS pixel — whatever the recipe's
scale — without the recorder's pointer and marks.
`elements` — at most 300, in document order — are `{ kind, name, target,
rect, visible }`: `kind` is `link`, `button`, `input`, `heading`, `image`
or `section`; `rect` is in page CSS pixels; `visible` says whether it
shows now — inside the viewport and not cut off by a scrolling panel
around it; `target` finds exactly that element when used in
a step (its text or label when no other element shares it, otherwise a
CSS selector). Only the steps that are played have to be complete, so a
snapshot can be taken while the next step is still being written. Errors
are those of a recording, as a status: `422` (recipe, or a step that
cannot be done), `403` (a refused address), `502` (the page could not be
loaded), `503` (no browser).

## Music clips

Songs played by NearEdit's own synth ([MUSIC.md](./MUSIC.md)): a song — a
tempo, drum patterns, synth lines — is rendered into
`<project>/.nearedit/music/<key>.wav`: 16-bit PCM, 48 kHz, stereo, exactly
the samples the engine gives in the browser. The rendering is ordinary
sound: it is played through `/media/file`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/music/render` | `{ projectId, song }` → `200 { file, key, duration, cached }`, answered when the file exists |
| POST | `/music/import` | `{ projectId?, path }` → `{ song, warnings }` for a `.mid` / `.midi` file |

**Render** is not a job: the request takes as long as the render —
typically well under two seconds, and no time for a rendering that exists.

```json
{
  "file": "/project/.nearedit/music/a1567cdad764efd4909d.wav",
  "key": "a1567cdad764efd4909d", "duration": 5, "cached": false
}
```

`key` is `songKey(song)`; `duration` is the length of the file, the song
with its tail; `cached` is true when nothing had to be rendered. The song
is checked with `validateSong` as it was sent: `422` with one entry per
problem in `fields` (`"parts[0].kit": "\"707\" is not a kit: use one of
…"`; `fields.song` for a body without a song), `400` without a
`projectId`, `404` for an unknown project — all before anything is
rendered.

Rendering runs in a worker thread, `MUSIC_RENDER_CONCURRENCY` songs at a
time; further requests wait their turn. Requests for one song at the same
moment share one render (`cached: false` for each of them). A client that
closes the connection stops its render — unless another request waits for
the same song. A song that is not finished after ten minutes is refused:
`422 The song is too heavy to render…` (sixteen parts of wide unison
chords render slower than they play). `403` when the project's folder
cannot be written, `500` when the renderer stops unexpectedly. A render
that is cancelled or fails leaves no file, whole or partial.

**Import.** `path` is absolute, or relative to the project's folder (which
needs `projectId`). The file must pass the media allow-list (`403`), exist
(`404`), be named `.mid` or `.midi`, be at most 5 MB and hold a MIDI
header (each `422` with the reason in `fields.path`). The answer is
`songFromMidi`'s: a normalised song — channel 10 as drum lanes, every other
channel a synth part — and `warnings`, what could not be carried over.
The file is read in a thread of its own, two at a time; one that is not a
song after 20 seconds is refused (`422`), and a client that goes away
stops the reading. Nothing is written.

**In a render.** `POST /render` and `/render/plan` never wait for the
editor: every music clip is pointed at the rendering of its song as it is
now — whatever `sourceFile` and `music.key` the document holds — and what
is missing is rendered when the job (or the plan) starts, into the
project, or into `<data>/.nearedit/music/` for a timeline posted without a
project. See [RENDER.md](./RENDER.md#limits-and-what-is-not-honoured).

## Person cutout

A person without their background ([CUTOUT.md](./CUTOUT.md)): a matte
program — the built-in worker, or one of your own — is run over the frames
of a stretch of a media file, and picture and matte are packed side by
side into `<project>/.nearedit/cutout/<key>.mp4`, described by `<key>.json`
beside it. The file is played through `/media/file`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/cutout/status` | `{ available, provider, model, reason, detail, python, file, command }`. `?fresh` asks the matte program again |
| POST | `/cutout` | `{ projectId, path, start, end, fps? }` → `202 { jobId }`, job type `cutout` |
| GET | `/cutout/meta?projectId=&key=` | The description of a cutout file (404 when there is none) |

**Status** is found out by asking. `provider` is `builtin`
(`workers/person_matte.py`, started with its model and run once) or
`command` (`CUTOUT_COMMAND`, sent two 64 × 64 frames); a good answer is
remembered until the model file or the setting changes. `model` names what
makes the matte, with its settings — `modnet-07c308cf0fc7/size512/steady0.6/v1`,
or `command:<the command>` — and is part of every key. `reason` says what
is missing and the command that gets it (`Python at python3 has no
onnxruntime: python3 -m pip install onnxruntime numpy`, `No model at
/data/models/modnet.onnx: npm run install-cutout`); `''` when `available`.

**Cut out.** `path` is absolute or relative to the project folder; `start`
and `end` are seconds of the file, put on the frame grid of `fps` — the
document's, default 30 — so that the stretch starts on the frame on screen
at `start`. Refused before a job exists: `400` without `projectId` or
`path`, `404` for an unknown project or a missing file, `403` outside the
allowed folders, `422` with `fields` for a still or a sound file, a file
without a picture, a `start` after its end, an `end` not after `start` or
more than 30 minutes after it, an `fps` outside 1 to 240 — and `503` with
the status's `reason` without a matte program. Cutout jobs run in their
own lane, `CUTOUT_CONCURRENCY` at a time, labelled `Cut out: <file name>`;
progress messages are `frame n of m`. The job's result:

```json
{
  "file": "/project/.nearedit/cutout/0a51bd39df6c629f93d1.mp4",
  "key": "0a51bd39df6c629f93d1", "source": "/project/selfie.mp4", "start": 3, "end": 20, "fps": 30,
  "width": 1280, "height": 720, "frames": 510, "cached": false
}
```

`key` is `cutoutKey({ source, start, end, fps, model })`, `source` being
the file's `{ path, size, mtime }` as `/media` lists them. `width` ×
`height` is the picture: the source as it is shown, reduced to fit 1920 ×
1080, sides even. `cached` is true when nothing had to be made — the key
is there, or a longer cutout of the same file, rate and model covers the
stretch (the result then carries that cutout's key and range). Requests
for one key at the same moment share one run. A failed job names the stage
and what it printed (`The matte program stopped (exit code 3) after 12 of
510 frames: …`); cancelling ends both FFmpegs and the matte program; a
failed or cancelled cutout leaves no file, whole or partial.

**The file** is H.264 (High, yuv420p, limited range, CRF 16 `veryfast`, a
key frame every half second, no sound), `2 × width` by `height`: the
picture on the left, its matte on the right, white where the person is.
Frame `n` is the frame a render shows at `start + n / fps`, by the
renderer's own frame rule, and its matte was made from that very picture.
A BT.601 source stays BT.601 (the file is tagged). The description is
`{ version: 1, key, source: { path, size, mtime }, start, end, fps, width,
height, frames, model }`, with `end = start + frames / fps`.

## Brand kits

`/kits`, `/kits/:id` and its `/files/:name`, `/projects/:id/kit` and its
`/files/:name` — the library of brand kits, the kit a project uses and the
effective kit the editor draws elements from: [BRAND-API.md](./BRAND-API.md).
