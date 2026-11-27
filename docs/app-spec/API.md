# NearEdit HTTP + WebSocket API

All routes are mounted under `/api`. Bodies and responses are JSON unless
noted. Errors are `{ "error": "message", "detail"?: "...", "fields"?: {} }`
with a meaningful status (400 bad input, 403 path not allowed, 404 missing,
409 wrong state, 422 failed validation, 500 unexpected, 503 provider not
configured or unreachable).

Long work never blocks a request: it starts a **job** and answers
`202 { "jobId": "..." }`. Progress arrives over the WebSocket.

**File paths.** Media is addressed by absolute path. Every path taken from a
request is checked with `lib/paths.js` — it must sit inside a registered
project directory, one of its `mediaFolders`, a global media path, the dev
`media/` directory, or the server data directory. Anything else is `403`.

## Projects

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/projects` | `{ data: Project[], total }` |
| POST | `/projects` | `{ name, path }` → `201 Project`. Creates `.nearedit/project.json`, or re-registers an existing one found at `path` |
| GET | `/projects/:id` | Project with `adaptations[]` |
| PUT | `/projects/:id` | Shallow-merge update (`name`, `description`, `mediaFolders`, `status`) |
| DELETE | `/projects/:id` | Unregister only. Never deletes files |
| POST | `/projects/:id/adaptations` | `{ name, aspectRatio, resolution, fps, parentAdaptationId?, copyFrom? }` → `201 Adaptation`. `copyFrom` deep-copies that adaptation's EDL |
| PUT | `/projects/:id/adaptations/:aid` | Update name, aspectRatio, resolution, fps, status |
| DELETE | `/projects/:id/adaptations/:aid` | Children are re-parented to the deleted one's parent. The last adaptation cannot be deleted (409) |
| GET | `/projects/:id/edl/:aid` | The adaptation's EDL (normalised to v2) |
| PUT | `/projects/:id/edl/:aid` | Replace the EDL (validated, 422 on a broken document) |

## Media

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/media?projectId=` | `{ data: MediaItem[], total }` |
| GET | `/media/file?path=` | Stream a file (HTTP range supported) |
| GET | `/sidecar?path=` | The sidecar, or `{ exists: false }` |
| PUT | `/sidecar?path=` | Merge a patch into the sidecar (user edits to tags, transcript) |
| GET | `/previews/thumbnail?path=&cols=10&height=90` | JPEG filmstrip of `cols` frames |
| GET | `/previews/frame?path=&time=&height=` | One JPEG frame |
| GET | `/previews/waveform?path=` | `200 { peaks, samples, duration }` or `202 { status: "generating" }` (a `waveform` job then completes with `result.path`) |
| GET | `/transcode?path=` | WAV rendition of a compressed audio file, for sample-accurate seeking |
| GET | `/index/search?q=&projectId=` | Search filenames, tags and transcripts |

```json
{
  "filename": "park.mp4", "filePath": "/abs/park.mp4", "relativePath": "day1/park.mp4",
  "type": "video", "global": false, "size": 1234567, "duration": 14.08,
  "width": 3840, "height": 2160, "fps": 60, "hasAudio": true,
  "indexed": true, "tags": ["park", "dog"],
  "analysis": { "transcript": true, "tags": true, "beats": false, "scenes": true, "silences": true }
}
```

`type` is `video`, `audio`, `image` or `text`. `duration` comes from the
sidecar when indexed, otherwise from a cached probe.

## Folder browser

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/browse?path=` | `{ path, parent, roots, dirs: [{ name, path, hasProject }] }`. No `path` = first browse root. Restricted to `BROWSE_ROOTS` |
| POST | `/browse/mkdir` | `{ path, name }` → `201 { path }` |
| POST | `/pick-folder` | Native OS dialog when the server has a desktop; `204` otherwise |

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
`silence`, `waveform`, `director`, `script`, `render`.
`result` in a summary holds only the small scalar fields of the full result.

### WebSocket `/ws`

Server → client messages:

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
`silence`. Default: every step whose provider is available and that suits
the file type. Steps already present in a fresh sidecar are skipped unless
`force`. An `analyze` job's result is
`{ files: [{ path, steps: { probe: "ok", transcribe: "skipped", tags: "error: …" } }] }`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/intelligence/status` | Which providers are configured and reachable |
| GET | `/intelligence/transcript?path=&format=` | Export as `json`, `srt`, `vtt` or `txt` |

```json
{
  "ffmpeg": { "available": true, "detail": "6.1.1" },
  "transcription": { "provider": "whisper-cpp", "available": true, "detail": "" },
  "vision": { "provider": "ollama", "available": false, "detail": "connection refused" },
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
with `applyDirectorResult` as a single undoable step.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/director/actions` | `{ data: ActionSchema[] }` — drives the director form |
| POST | `/director` | `{ projectId, adaptationId, directive, edl }` → `202 { jobId }`; result is a DirectorResult |
| POST | `/director/script` | Same body → job result `{ scripts: [{ variant, filename, filePath, script }] }` |

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
| `remove_silence` | no | Tighten clips using word timestamps or detected silences |
| `beat_sync` | no | Move cuts onto the beats of a music clip |
| `add_captions` | no | Title clips generated from a transcript |

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
created. Clips are complete v2 clips (`createClip`). For `remove_silence`
and `beat_sync`, which rewrite existing clips in place, `mode` is `replace`
or `range` and the fragment already contains the rewritten clips.

## Render

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/render/presets` | `{ data: [{ id, label, description }] }` |
| POST | `/render` | `{ projectId, adaptationId, edl?, preset?, range?, filename? }` → `202 { jobId }`. Without `edl` the saved one is rendered |
| POST | `/render/plan` | Same body → `{ args, filterComplex, duration }` without running (inspection, tests) |
| GET | `/renders?projectId=` | `{ data: [{ file, url, size, createdAt, projectId, adaptationId }] }` |
| GET | `/render/file/:name` | Stream or download a finished render (range supported) |
| DELETE | `/render/file/:name` | Delete a finished render |

Presets: `draft` (half resolution, fast), `standard` (default), `high`.
A `render` job's result is
`{ output, file, url, duration, size, width, height, fps }`. Cancelling the
job kills FFmpeg and removes the partial file.
