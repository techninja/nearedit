# EDL v2 — Timeline Document Schema

The EDL (Edit Decision List) is the single source of truth for an
adaptation's timeline. Everything — the canvas timeline, the preview
compositor, the AI director and the FFmpeg renderer — reads and writes this
one JSON shape. Raw media is never modified.

- Shape + defaults in code: `src/utils/edl/factory.js`, `src/utils/edl/defaults.js`
- Browser store model: `src/store/TimelineState.js` (hybrids drops any field
  that is not declared there — add new fields to the model first)
- Pure operations: `src/utils/edl/*.js` (isomorphic, Node-tested), see
  [Operations](#operations)

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
| clips   | Clip[]  | Kept sorted by `timelineStart`, ties by `timelineEnd` |

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

1. **Speed is 1.** For video and audio clips `timelineEnd - timelineStart ===
   sourceOut - sourceIn`. Images, titles and placeholders have a free
   duration; their `sourceIn`/`sourceOut` are ignored.
2. **Bounds.** `timelineStart >= 0`, `timelineEnd > timelineStart`,
   `sourceIn >= 0`, and `sourceOut` never exceeds the source duration when
   it is known.
3. **Fades fit.** `fadeIn >= 0`, `fadeOut >= 0`, `fadeIn + fadeOut <=
   duration`.
4. **Overlap means cross-fade.** Two clips on one track may overlap only as
   a cross-fade pair: one of them starts first *and* ends first (a clip is
   never inside another, and overlapping clips never share an edge), and the
   earlier clip's `fadeOut` and the later clip's `fadeIn` both equal the
   overlap length. No point on a track is covered by more than two clips.
   This is the Vegas "drag one clip over another" fade.
5. **Links are symmetric.** If A's `linkedClipId` is B then B's is A, and B
   exists.
6. **Structure.** Track, clip and marker ids are unique. Video tracks come
   before audio tracks and there is at least one of each. Clips are sorted
   by `timelineStart` (ties by `timelineEnd`), markers by `time`.

`validateEdl(edl, { sourceDurations? })` checks all of the above plus field
types and enums and returns `{ valid, problems: [{ path, message }] }`.
Times are compared with a 1 µs tolerance (`EPS`); the source-duration check
allows half a frame, because the frame grid rarely lands exactly on the end
of a source. `normalizeEdl(raw)` turns anything — a v1 file, LLM output,
garbage — into a document that passes.

Operations keep `timelineStart`/`timelineEnd` on the frame grid; source
times are not snapped. Being on the grid is not an invariant (changing an
adaptation's `fps` must not invalidate its timeline): `normalizeEdl`
re-snaps a document to its current `fps`.

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

Every edit is a pure function `(edl, ...args) => edl` in `src/utils/edl/`,
exported from `src/utils/edl/index.js`. An operation never mutates its
input and shares everything it did not change: untouched tracks and clips
keep their identity, and an operation that changes nothing returns the very
same document. Flags (snapping, ripple, auto-crossfade, linked) are passed
in a trailing options object.

The UI pushes the previous document onto the undo stack (`createHistory`
stores references, not copies), calls the operation, and stores the result.
A drag calls the operation on every pointer move with the document the drag
started from. The AI director never returns a whole document: it returns a
**DirectorResult** (see API.md) that `applyDirectorResult(edl, result)`
merges in, so every automated edit is one undoable step that the user can
then hand-tune.

| Module | Operations |
| ------ | ---------- |
| `factory.js`, `defaults.js` | Defaults, ids, `createClip`, `createTrack`, `createEdl`, `clipKind` |
| `query.js` | Lookups: `findClip`, `clipsAt`, `allClips`, `timelineDuration`, `snapToFrame`… |
| `normalize.js`, `savedDocument.js` | `normalizeEdl`; `toSavedDocument` / `fromSavedDocument` (document + view fields) |
| `validate.js` | `validateEdl` |
| `move.js` | `moveClips` — in time and between tracks of one type |
| `trim.js` | `trimClipStart`, `trimClipEnd` (optional ripple) |
| `split.js` | `splitClips` |
| `clipEdit.js` | `deleteClips`, `slipClip`, `setClipFades`, `updateClip` |
| `crossfade.js` | `settle` — overlap resolution used by every operation above and below |
| `ripple.js`, `gaps.js` | `rippleDelete`, `rippleDeleteRange`, `rippleInsert`, `closeGaps` |
| `snap.js` | `snapTime`, `snapEdges`, `snapMove`, `snapCandidates` |
| `trackOps.js` | `addTrack`, `removeTrack`, `moveTrack`, `renameTrack`, `toggleTrackMute/Solo/Lock`, `setTrackVolume` |
| `selection.js` | `expandSelection`, `groupClips`, `ungroupClips`, `linkClips`, `unlinkClips`, `clipsInRange`, `newClipIds` |
| `clipboard.js` | `copyClips`, `pasteClips`, `duplicateClips` |
| `insert.js` | `insertMedia`, `insertTitle` |
| `markers.js` | `addMarker`, `moveMarker`, `renameMarker`, `updateMarker`, `removeMarker` |
| `apply.js` | `applyDirectorResult` |
| `history.js` | `createHistory` — undo / redo |

Internal building blocks: `time.js`, `immutable.js`, `clipMath.js`,
`fades.js`, `place.js`, `session.js`, `partners.js`, `links.js`,
`shift.js`, `trimLimits.js`, `placement.js`, `sanitize.js`,
`normalizeClip.js`, `fragment.js`, `validateClip.js`. `types.js` holds the
shared JSDoc types (`Edl`, `Track`, `Clip`, `Marker`) and `testkit.js` the
fixtures for tests (`testEdl`, `testClip`, `deepFreeze`, `assertValid`).

### Editing rules

**Locked tracks.** A clip on a locked track is never moved, trimmed, split,
deleted, overwritten or rippled, and nothing is placed on a locked track.
The one field that may change on such a clip is `linkedClipId`: it is
cleared, or re-pointed at the surviving half, when its partner is deleted,
split or cut away (invariant 5).

**Linked and grouped clips.** Linked partners move, trim, slip, split and
delete together; grouped clips move together. Every such operation takes
`linked: false` (and `moveClips` also `grouped: false`) to edit one clip
alone — that is how J- and L-cuts are made.

**Overlaps: cross-fade or overwrite.** The clips an operation moves, trims
or adds are its *incoming* clips. After the edit, on each changed track:

- An incoming clip that partially overlaps another clip (invariant 4's
  shape) forms a cross-fade pair with it — when auto-crossfade is on, or
  when the two were already cross-fading before the edit.
- Otherwise the incoming clip wins and what is under it is trimmed, split
  or removed (an overwrite edit). This happens when auto-crossfade is off,
  when one clip would lie inside the other or share an edge with it, and
  when a third clip already covers part of the overlap.
- An overwrite cuts the linked partner of the overwritten clip over the
  same time range, so a linked pair is always cut as one; the pieces on
  each side are linked to each other again. `linked: false` leaves the
  partner whole.

**Automatic and deliberate fades.** A fade is *automatic* when it exists
because of an overlap, *deliberate* when the user set it on a free edge.
Nothing is stored to tell them apart; the rule is: **an edge that
overlapped a neighbour in the document before the operation carried an
automatic fade.** After the operation each edge gets:

- the overlap length, if it overlaps a neighbour now;
- `0`, if it overlapped before and no longer does (pulling two cross-faded
  clips apart removes both fades);
- its previous value otherwise (deliberate), shortened only if it no longer
  fits beside the fade on the other edge (invariant 3).

A deliberate fade that an overlap replaces is gone once that edit is
committed; while a drag is in progress every pointer move starts from the
original document, so backing out of the overlap restores it.
`setClipFades` cannot change an edge that is cross-fading — move or trim
the clip to change the cross-fade length.

**Trim limits.** `sourceIn` never goes below 0 and `sourceOut` never passes
the source duration when a `sourceDurations` map is supplied. A clip keeps
at least one frame and stays longer than the cross-fade on its other edge.
Images, titles and placeholders trim freely.

**Splits and cross-fades.** While two clips cross-fade they are fused: a
split at a time inside the cross-fade leaves those two clips alone (a half
would end up inside the other clip). Ripple edits must open every track at
one time, so there a cross-fade under the cut becomes a hard cut: the
outgoing clip ends at that time and the incoming one starts at it.

**Ripple.** `rippleDelete` closes the hole a deletion leaves — the time the
deleted clips covered that no remaining clip on their tracks still covers —
on the tracks that lost a clip (`scope: 'track'`) or on every unlocked track
together with the markers (`scope: 'all'`). `rippleInsert` and
`rippleDeleteRange` open or remove time on every unlocked track (or the
given ones). Clips that ripple are incoming clips and follow the overlap
rules above.

**Director results.** `applyDirectorResult` normalises the fragment's
clips and maps fragment tracks to the Nth track of their type, creating
missing tracks below the existing ones. A fragment clip keeps its id when
that id is free in the document — so clips an action rewrites in place stay
selected — and gets a fresh one when it clashes or repeats; links and
groups inside the fragment are kept either way.

`replace` removes the clips on unlocked tracks and all markers first, and
the tracks adopt the result's layout: each row is named as the result names
it, a row that carries the `trackId` of an existing track stays on that
track (its mute, solo, volume and lock travel with it), and tracks the
result does not mention follow the rows it does. `append` starts at the end
of the timeline; `prepend` and `insert` ripple-insert the fragment's length
at 0 / `at`; `range` cuts `range` out and ripples later clips by the
difference in length. A locked target track is never written or renamed —
its fragment clips go to a new track. An unknown mode, or a mode whose
position is missing, falls back to `append`.

## Rendering Semantics

- Layers composite back to front: last video track first, first video
  track last. Clips on one track draw in `timelineStart` order.
- **Video cross-fades are true dissolves.** While a later clip on the same
  track fades in over it, the outgoing clip stays fully opaque underneath;
  its `fadeOut` is ignored for picture. A `fadeOut` with nothing cross-fading
  over it fades to whatever is behind (lower tracks, or black).
  `levels.js` `videoOpacity(track, clip, time)` implements this.
- Audio from all audible audio tracks is summed. Gain at any moment is
  `track.volume × clip.volume × fadeFactor` (`levels.js` `clipGain`); audio
  cross-fades are equal-gain, so both clips ramp.
- Gaps render as black video and silence.
- Output frame size and rate come from `resolution` and `fps`.
- Placeholders render as nothing (they are planning aids).
