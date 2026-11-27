# EDL v2 — Timeline Document Schema

The EDL (Edit Decision List) is the single source of truth for an
adaptation's timeline. Everything — the canvas timeline, the preview
compositor, the AI director and the FFmpeg renderer — reads and writes this
one JSON shape. Raw media is never modified.

- Shape + defaults in code: `src/utils/edl/factory.js`, `src/utils/edl/defaults.js`
- Browser store model: `src/store/TimelineState.js` (hybrids drops any field
  that is not declared there — add new fields to the model first)
- Pure operations: `src/utils/edl/*.js` (isomorphic, Node-tested)

## Document

```json
{
  "version": 2,
  "fps": 30,
  "resolution": "1920x1080",
  "tracks": [],
  "markers": [{ "markerId": "m_1", "time": 12.5, "label": "Chorus", "color": "" }],
  "playheadPosition": 0,
  "cursorPosition": 0,
  "zoom": 1,
  "scrollX": 0
}
```

`playheadPosition`, `cursorPosition`, `zoom` and `scrollX` are view state.
In the browser they live in `ViewState`, not `TimelineState`; they are merged
into the document when it is saved and split back out on load, so reopening
an adaptation restores where the editor was.

All times are **seconds** (floats). Edits snap to frame boundaries
(`Math.round(t * fps) / fps`).

## Track

| Field   | Type    | Notes                                          |
| ------- | ------- | ---------------------------------------------- |
| trackId | string  | Unique within the document                     |
| type    | enum    | `video` or `audio`                             |
| name    | string  | Shown in the track header                      |
| muted   | boolean | Video: hidden. Audio: silent                   |
| solo    | boolean | When any track of a type is solo, only those play |
| locked  | boolean | Clips cannot be edited or selected             |
| volume  | number  | Audio tracks: linear gain 0..2                 |
| clips   | Clip[]  | Kept sorted by `timelineStart`                 |

Track order is display order, top to bottom. Video tracks always sit above
audio tracks. **The first video track is the front-most layer** (Vegas
convention: higher on screen = in front).

Only audio tracks produce sound. A video file's sound is a separate clip on
an audio track, joined to its picture by `linkedClipId`.

## Clip

| Field         | Type    | Notes                                              |
| ------------- | ------- | -------------------------------------------------- |
| clipId        | string  | Unique within the document                         |
| sourceFile    | string  | Absolute path. Empty for titles and placeholders   |
| sourceIn      | number  | Seconds into the source where the clip starts      |
| sourceOut     | number  | Seconds into the source where the clip ends        |
| timelineStart | number  | Position on the timeline                           |
| timelineEnd   | number  | End on the timeline                                |
| fadeIn        | number  | Seconds; opacity (video) or gain (audio) ramp      |
| fadeOut       | number  | Seconds                                            |
| volume        | number  | Clip gain 0..2 (audio tracks)                      |
| linkedClipId  | string  | A/V partner: moves, trims, splits, deletes together |
| groupId       | string  | Clips sharing a groupId move together              |
| placeholder   | boolean | An intention without media yet                     |
| label         | string  | Name shown on the clip                             |
| prompt        | string  | Generation prompt / search query / notes           |
| intent        | string  | narration, broll, sfx, music, title, transition    |
| color         | string  | Timeline colour override (hex)                     |
| text          | object  | Title text block, see below                        |
| transform     | object  | Geometry, see below                                |

`clipKind(clip, track)` in `factory.js` classifies a clip as `video`,
`audio`, `image`, `title` (no `sourceFile`, non-empty `text.content`) or
`placeholder` (no `sourceFile`, empty text).

### Invariants

1. For video and audio clips `timelineEnd - timelineStart === sourceOut -
   sourceIn` (playback speed is always 1). Images, titles and placeholders
   have a free duration; their `sourceIn`/`sourceOut` are ignored.
2. `timelineStart >= 0`, `timelineEnd > timelineStart`, `sourceIn >= 0`, and
   `sourceOut` never exceeds the source duration when it is known.
3. `fadeIn + fadeOut <= duration`.
4. **Overlap means cross-fade.** Two clips on one track may overlap only as
   a cross-fade pair: the earlier clip's `fadeOut` and the later clip's
   `fadeIn` both equal the overlap length. No point on a track is covered by
   more than two clips. This is the Vegas "drag one clip over another" fade.
5. A `linkedClipId` is symmetric: if A links to B then B links to A.

### text

A clip with no `sourceFile` and a non-empty `text.content` is a title. It
lives on a video track and is composited like any other layer.

| Field        | Type    | Notes                                     |
| ------------ | ------- | ----------------------------------------- |
| content      | string  | May contain `\n` line breaks              |
| fontFamily   | enum    | `sans-serif`, `serif`, `monospace`        |
| fontSize     | number  | Pixels at output resolution               |
| color        | string  | Hex                                       |
| background   | string  | Box colour behind the text, empty = none  |
| align        | enum    | `left`, `center`, `right`                 |
| bold         | boolean |                                           |
| italic       | boolean |                                           |
| outlineColor | string  | Hex                                       |
| outlineWidth | number  | Pixels at output resolution, 0 = none     |

The text block is centred in the frame, then moved by `transform.x`/`y`
and affected by `transform.opacity`, `rotation` and `scaleX`/`scaleY`.

### transform

| Field                | Type   | Notes                                           |
| -------------------- | ------ | ----------------------------------------------- |
| fit                  | enum   | `cover` (fill, crop overflow) or `contain`      |
| x, y                 | number | Offset from centred, **pixels at output resolution** |
| scaleX, scaleY       | number | Multiplier applied after fitting                |
| rotation             | number | Degrees clockwise, about the anchor             |
| opacity              | number | 0..1                                            |
| cropTop/Bottom/Left/Right | number | Fraction of the source removed, 0..1       |
| anchorX, anchorY     | number | 0..1 within the drawn rectangle                 |
| kenBurns             | object | Animated pan/zoom, see below                    |

Placement algorithm (preview and render must agree):

1. Crop the source by the crop fractions.
2. Fit the cropped source to the output frame (`cover` or `contain`),
   preserving aspect ratio.
3. Multiply the fitted size by `scaleX` / `scaleY`.
4. Centre it in the frame, then offset by `x`, `y`. The preview scales
   `x`/`y` by `previewWidth / outputWidth`.
5. Rotate about the anchor, apply `opacity` × fade factor.

### kenBurns

```json
{ "enabled": true, "startScale": 1.0, "endScale": 1.3, "startX": 0, "endX": -50,
  "startY": 0, "endY": 0, "startCropTop": 0, "endCropTop": 0 }
```

When `enabled`, `x`, `y`, `scaleX`/`scaleY` and the four crops are **replaced**
by a linear interpolation from the `start*` to the `end*` values over the
clip's duration (`startScale`/`endScale` drive both scale axes). When
disabled the static transform values apply. v1 documents had no `enabled`
flag: on load, a v1 clip whose start and end values differ is treated as
enabled.

## Operations

Every edit is a pure function `(edl, ...args) => edl` in `src/utils/edl/`.
The UI pushes the previous document onto the undo stack, calls the
operation, and stores the result. The AI director never returns a whole
document: it returns a **DirectorResult** (see API.md) that
`applyDirectorResult(edl, result)` merges in, so every automated edit is one
undoable step that the user can then hand-tune.

| Module         | Responsibility                                               |
| -------------- | ------------------------------------------------------------ |
| `factory.js`   | Defaults, ids, `createClip`, `createTrack`, `clipKind`       |
| `normalize.js` | Migrate v1 → v2, fill defaults, sort clips, drop invalid ones |
| `query.js`     | Lookups: duration, clips at a time, clip by id, edges        |
| `clipOps.js`   | Move (incl. between tracks), trim, slip, split, delete       |
| `crossfade.js` | Resolve overlaps into cross-fade pairs (invariant 4)         |
| `ripple.js`    | Ripple delete / insert / close gaps                          |
| `snap.js`      | Snap candidates (clip edges, playhead, markers, beats)       |
| `trackOps.js`  | Add, remove, reorder, rename tracks; mute / solo / lock      |
| `selection.js` | Multi-select helpers, linked/grouped expansion, copy/paste   |
| `markers.js`   | Add / move / remove markers                                  |
| `apply.js`     | `applyDirectorResult` — replace, append, prepend, insert, range |
| `validate.js`  | Check a document against the invariants above                |

## Rendering Semantics

- Layers composite back to front: last video track first, first video
  track last. Within a cross-fade both clips draw, each with its own fade.
- Audio from all audible audio tracks is summed. Gain at any moment is
  `track.volume × clip.volume × fadeFactor`.
- Gaps render as black video and silence.
- Output frame size and rate come from `resolution` and `fps`.
- Placeholders render as nothing (they are planning aids).
