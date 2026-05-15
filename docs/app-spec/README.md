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
<project-dir>/                ← User-chosen location (e.g. ~/Projects/park-edit)
  .nearedit/
    project.json              ← Self-contained project file (config + adaptations + EDLs)

<media-folder>/               ← User's media (referenced by project.sourceFolders)
  PXL_20251228_*.mp4
  PXL_20251228_*.mp4.nearedit.json   ← Sidecar: transcript, tags, beats
  WattsNaturalEnvironment.mp3
  WattsNaturalEnvironment.mp3.nearedit.json

<global-media>/               ← Shared assets (env: GLOBAL_MEDIA_PATHS)
  logo_intro.mp4
  whoosh.wav

<repo>/data/
  registry.json               ← Lightweight index: project ID → path on disk
  renders/                    ← FFmpeg output
  previews/                   ← Cached thumbnails + waveforms
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

Projects reference source folders via `sourceFolders` (array of absolute
paths). The server scans these on demand. Global folders are configured
via `GLOBAL_MEDIA_PATHS` env var or future UI settings.

The repo's `media/` directory is a dev fallback — when a project has no
`sourceFolders` configured, the server scans `media/` instead.

## EDL (Edit Decision List) — Timeline State

Each adaptation's timeline is stored as a JSON EDL in the browser
(localStorage during dev, synced to server on save).

### Clip Types

Clips on the timeline can be either **fulfilled** (has a source file) or
**placeholder** (an intention without media yet).

Placeholders allow the AI director or user to plan an edit structurally
before all media exists:

- Narration segments that need TTS generation
- B-roll slots described by mood/content ("calm nature shot, 5s")
- SFX/music cues to be found or generated
- Title cards to be designed
- Transitions to be decided

Placeholder fields:

| Field       | Type    | Purpose                                      |
| ----------- | ------- | -------------------------------------------- |
| placeholder | boolean | true = no media attached yet                 |
| label       | string  | Human-readable name shown on timeline        |
| prompt      | string  | Generation prompt, search query, or notes    |
| intent      | string  | narration, broll, sfx, music, title, transition |
| color       | string  | Override timeline color (hex)                |

Once fulfilled, `sourceFile` is set and `placeholder` becomes false.
The clip retains its label/prompt as metadata.

### Ken Burns (Image Animation)

Still images on the timeline can have animated pan/zoom via the
`transform.kenBurns` object. Values interpolate linearly from start to
end over the clip's duration:

```json
"transform": {
  "scaleX": 1, "scaleY": 1,
  "kenBurns": {
    "startScale": 1.0,
    "endScale": 1.3,
    "startX": 0,
    "endX": -50,
    "startY": 0,
    "endY": 0
  }
}
```

The AI director uses ken burns automatically for images:
- Landscape image in 16:9 → slow zoom toward subject
- Landscape image in 9:16 → crop to subject, pan across
- Portrait image in 16:9 → zoom out to reveal, or pan vertically

```json
{
  "fps": 30,
  "resolution": "1920x1080",
  "playheadPosition": 12.5,
  "cursorPosition": 10.0,
  "zoom": 1,
  "scrollX": 0,
  "playing": false,
  "tracks": [
    {
      "trackId": "v1",
      "type": "video",
      "name": "Video 1",
      "muted": false,
      "solo": false,
      "clips": [
        {
          "clipId": "vclip_abc123",
          "sourceFile": "PXL_20251228_215419040.mp4",
          "sourceIn": 2.0,
          "sourceOut": 8.5,
          "timelineStart": 0.0,
          "timelineEnd": 6.5,
          "fadeIn": 0.0,
          "fadeOut": 0.5,
          "linkedClipId": "aclip_abc123",
          "transform": {
            "x": 0, "y": 0,
            "scaleX": 1, "scaleY": 1,
            "rotation": 0, "opacity": 1,
            "cropTop": 0, "cropBottom": 0,
            "cropLeft": 0, "cropRight": 0,
            "anchorX": 0.5, "anchorY": 0.5
          }
        }
      ]
    },
    {
      "trackId": "a1",
      "type": "audio",
      "name": "Audio 1",
      "muted": false,
      "solo": false,
      "clips": [...]
    }
  ]
}
```

## Keyboard Shortcuts (Configurable)

| Key           | Action                                    |
| ------------- | ----------------------------------------- |
| Space         | Play/pause — return to cursor on stop     |
| Enter         | Play/pause — cursor follows on stop       |
| J             | Rewind 2s                                 |
| K             | Stop (return to cursor)                   |
| L             | Forward 2s                                |
| Home          | Go to start                               |
| End           | Go to end                                 |
| ← / →        | Frame step                                |
| Ctrl+Z        | Undo                                      |
| Ctrl+Shift+Z  | Redo                                      |

Custom keymaps stored in `localStorage.nearedit_keymap`.
