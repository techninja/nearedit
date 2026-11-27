# NearEdit — Application Specification

## Data Model

### Project

The root container. A project is a **collection of assets** and their
metadata. It has no timeline of its own — timelines live in adaptations.

| Field       | Type   | Notes                        |
| ----------- | ------ | ---------------------------- |
| id          | uuid   | Auto-generated               |
| name        | string | Required                     |
| description | string | Optional                     |
| status      | enum   | active, archived             |

### Adaptation

An aspect-ratio-locked timeline variant. Adaptations **nest infinitely**
under a project or another adaptation, enabling:

- YouTube 16:9 long-form (root)
  - Instagram Reel 9:16 (child)
  - TikTok teaser 9:16 (child)
  - YouTube Short 9:16 (child)
- Podcast 16:9 (root, different edit)
  - Audiogram 1:1 (child)

Each adaptation owns its own EDL (tracks, clips, transforms) but shares
the parent project's asset pool.

| Field               | Type   | Notes                                    |
| ------------------- | ------ | ---------------------------------------- |
| id                  | uuid   | Auto-generated                           |
| projectId           | uuid   | Parent project                           |
| parentAdaptationId  | uuid   | Empty = root adaptation                  |
| name                | string | e.g. "YouTube Long Form"                 |
| aspectRatio         | enum   | 16:9, 9:16, 1:1, 4:5, 4:3, 21:9, custom |
| resolution          | string | e.g. "1920x1080"                         |
| fps                 | number | e.g. 30                                  |
| status              | enum   | draft, review, final, rendered           |

Future: sub-adaptation embedding on the timeline (rendered as a nested
clip, similar to Vegas nested sequences).

### Asset

A media file reference with indexed metadata. Assets can be:

- **Project-scoped**: belongs to one project
- **Global**: shared across all projects (logos, sound bites, intros, etc.)

| Field     | Type    | Notes                                          |
| --------- | ------- | ---------------------------------------------- |
| id        | uuid    | Auto-generated                                 |
| projectId | uuid    | Empty = global asset                           |
| filename  | string  | Relative path in media/ or media/global/       |
| type      | enum    | video, audio, image                            |
| category  | enum    | footage, music, sfx, voiceover, logo, graphic  |
| global    | boolean | Available to all projects                      |
| duration  | number  | Seconds (from ffprobe)                         |
| tags      | string  | Comma-separated searchable tags                |
| transcript| string  | Word-level timestamped text (Phase 2: Whisper) |

### File System Layout

```
<project-dir>/                ← User-chosen folder; everything in it is the project's media
  .nearedit/
    project.json              ← Self-contained project file (config + adaptations + EDLs)
  PXL_20251228_*.mp4
  PXL_20251228_*.mp4.nearedit.json   ← Sidecar: transcript, tags, beats, scenes
  scripts/                    ← Edit scripts written by the director

<extra-media-folder>/         ← Optional further folders (project.mediaFolders)
  WattsNaturalEnvironment.mp3
  WattsNaturalEnvironment.mp3.nearedit.json

<global-media>/               ← Shared assets (env: GLOBAL_MEDIA_PATHS)
  logo_intro.mp4
  whoosh.wav

<repo>/data/                  ← NEAREDIT_DATA_DIR
  registry.json               ← Lightweight index: project ID → path on disk
  renders/                    ← FFmpeg output
  previews/                   ← Cached thumbnails + waveforms
  transcode/                  ← WAV renditions for sample-accurate audio seeking
```

### Sidecar Metadata (`.nearedit.json`)

Lives next to each media file. Contains AI-generated metadata that's
expensive to recompute. Invalidated when source file mtime changes.

```json
{
  "_sourceMtime": 1715000000000,
  "_updatedAt": "2025-05-14T12:00:00.000Z",
  "duration": 14.08,
  "type": "video",
  "resolution": "3840x2160",
  "fps": 60,
  "transcript": [
    { "word": "hello", "start": 0.5, "end": 0.8 },
    { "word": "world", "start": 0.9, "end": 1.2 }
  ],
  "tags": ["park", "dog", "outdoor", "sunny"],
  "beats": [0.0, 0.5, 1.0, 1.5],
  "keyframes": [
    { "time": 0, "tags": ["wide shot", "park", "trees"] },
    { "time": 5, "tags": ["close up", "dog", "playing"] }
  ]
}
```

The project folder is scanned recursively for media. A project can list
further folders in `mediaFolders` (absolute paths — an external drive, a
NAS share); folders shared by every project (logos, stings, music) are set
with the `GLOBAL_MEDIA_PATHS` environment variable. The server reads media
only from these folders.

The sidecar also carries `scenes`, `silences`, `bpm` and per-file probe
data; the complete list is in [API.md](./API.md#sidecar-fields).

The repo's `media/` directory is a dev fallback, scanned when no project
is given.

## EDL (Edit Decision List) — Timeline State

Each adaptation's timeline is a JSON EDL saved in the project file and
loaded into the browser. The full schema — tracks, clips, titles,
transforms, ken burns, markers, invariants and editing rules — lives in
[EDL.md](./EDL.md). The short version:

- A document has `fps`, `resolution`, `tracks` and `markers`.
- Video tracks sit above audio tracks; the first video track is in front.
- A clip separates **source timing** (`sourceIn`/`sourceOut`) from
  **timeline timing** (`timelineStart`/`timelineEnd`).
- Overlapping two clips on a track cross-fades them (the Vegas fade).
- A video file's sound is a separate clip on an audio track, linked to its
  picture by `linkedClipId`.

### Clip Types

Clips are **media** (video, audio, image), **titles** (no source file, a
`text` block) or **placeholders** (an intention without media yet).

Placeholders let the AI director or the user plan an edit structurally
before all media exists: narration that still needs recording, a B-roll
slot described by mood ("calm nature shot, 5s"), a music cue to find.

| Field       | Type    | Purpose                                         |
| ----------- | ------- | ----------------------------------------------- |
| placeholder | boolean | true = no media attached yet                    |
| label       | string  | Human-readable name shown on timeline           |
| prompt      | string  | Generation prompt, search query, or notes       |
| intent      | string  | narration, broll, sfx, music, title, transition |
| color       | string  | Override timeline colour (hex)                  |

Once fulfilled, `sourceFile` is set and `placeholder` becomes false. The
clip keeps its label and prompt as metadata.

### Ken Burns (Image Animation)

Stills (and video) can pan and zoom through `transform.kenBurns`: with
`enabled: true`, position, scale and crop interpolate linearly from the
`start*` to the `end*` values over the clip. The director applies a gentle
move to stills automatically, chosen for the adaptation's aspect ratio.

## Related documents

| Document | Covers |
| -------- | ------ |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, state, pipelines, conventions |
| [EDL.md](./EDL.md) | Timeline document schema and editing rules |
| [API.md](./API.md) | HTTP + WebSocket API |
| [CONFIGURATION.md](./CONFIGURATION.md) | Environment variables, access and security |
| [INTELLIGENCE.md](./INTELLIGENCE.md) | Transcription, tagging, beats, scenes: setup and output |
| [DIRECTOR.md](./DIRECTOR.md) | AI director actions, edit plans, base edit |
| [RENDER.md](./RENDER.md) | How the EDL becomes an FFmpeg render |

## Keyboard Shortcuts (Configurable)

`Mod` is Ctrl, or Cmd on macOS. Press `?` in the editor for the live list.

| Key | Action |
| --- | ------ |
| Space | Play / stop — return to the edit cursor on stop |
| Enter | Play / pause in place — the cursor follows |
| J / K / L | Rewind 2 s / stop (return to cursor) / forward 2 s |
| Home / End | Go to start / end |
| ← / → | Step one frame (Shift: ten frames) |
| ↑ / ↓ | Previous / next edit point (Shift: marker) |
| Q | Toggle loop playback |
| Mod+Z / Mod+Shift+Z | Undo / redo |
| S | Split at the cursor |
| Delete, Backspace | Delete (Shift: ripple delete, closing the gap) |
| [ / ] | Trim the selection's start / end to the cursor |
| , / . | Nudge the selection one frame (< / >: ten frames) |
| Mod+X / C / V / D | Cut / copy / paste / duplicate |
| Mod+A / Escape | Select all / none |
| G / U | Group / ungroup |
| Shift+L / Shift+U | Link / unlink picture and sound |
| M / T | Add a marker / a title at the cursor |
| N / R / X | Toggle snapping / ripple / auto cross-fade |
| - / + / \ | Zoom out / in / to fit |
| ? | Show all shortcuts |

Mouse and touch: drag a clip to move it (onto another track of the same
type too), drag an edge to trim, Alt-drag to slip, drag the top corners for
fades, drag the ruler to scrub, Shift-drag the ruler for a loop region,
Mod+wheel or pinch to zoom about the pointer. Hold Shift while dragging to
bypass snapping. Overlapping two clips cross-fades them.

Custom keymaps are stored in `localStorage.nearedit_keymap` as a JSON
object. An entry either replaces a command's shortcuts
(`{ "edit.split": "C", "marker.add": "" }` — an empty value unbinds) or
binds a key to a command (`{ "Ctrl+B": "edit.split" }`).
