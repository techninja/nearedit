# EDL Operations

The editing operations on a timeline document ([EDL.md](./EDL.md) is the
schema). Every edit is a pure function `(edl, ...args) => edl` in
`src/utils/edl/`, exported from `src/utils/edl/index.js`. An operation never
mutates its input and shares everything it did not change: untouched tracks
and clips keep their identity, and an operation that changes nothing returns
the very same document. Flags (snapping, ripple, auto-crossfade, linked) are
passed in a trailing options object.

The UI pushes the previous document onto the undo stack (`createHistory`
stores references, not copies), calls the operation, and stores the result.
A drag calls the operation on every pointer move with the document the drag
started from. The AI director never returns a whole document: it returns a
**DirectorResult** (see API.md) that `applyDirectorResult(edl, result)`
merges in, so every automated edit is one undoable step that the user can
then hand-tune.

## Modules

| Module | Operations |
| ------ | ---------- |
| `factory.js`, `defaults.js`, `clipKind.js` | Defaults, enumerations (`BLEND_MODES`, `FADE_CURVES`, `TEXT_ANIMATIONS`, `TEXT_UNITS`), ids, `createClip`, `createTrack`, `createEdl`, `clipKind` |
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
| `trackOps.js`, `trackSettings.js` | `addTrack`, `removeTrack`, `moveTrack`; `updateTrack`, `renameTrack`, `toggleTrackMute/Solo/Lock`, `setTrackVolume`, `setTrackOpacity`, `setTrackBlendMode` |
| `selection.js` | `expandSelection`, `groupClips`, `ungroupClips`, `linkClips`, `unlinkClips`, `clipsInRange`, `newClipIds` |
| `clipboard.js`, `attributes.js` | `copyClips`, `pasteClips`, `duplicateClips`; `pasteAttributes` |
| `insert.js`, `generator.js` | `insertMedia`, `insertTitle`; `insertGenerator`, `updateGenerator` |
| `animate.js`, `easing.js` | Keyframe evaluation: `resolveClip`, `valueAt`, `clipLocalTime`, `getPath`, `setPath`, `EASINGS` |
| `keyframes.js`, `autoKey.js` | `setKeyframe`, `removeKeyframe`, `moveKeyframe`, `setKeyframeEase`, `removeKeyframesAt`, `moveKeyframesAt`, `clearKeyframes`; `setValueAt`, `setAnimated` |
| `keyframeQuery.js`, `clipPaths.js` | `isAnimated`, `keysOf`, `animatedPaths`, `listKeyframes`, `keyframeTimes`, `nextKeyframeTime`, `previousKeyframeTime`, `keyTime`; `describePath` |
| `effects.js` | `addEffect`, `removeEffect`, `moveEffect`, `updateEffect`, `setEffectEnabled`, `effectsOf` |
| `levels.js`, `fadeCurves.js`, `gainEnvelope.js` | `fadeFactor`, `videoOpacity`, `clipGain`; `fadeInLevel`, `fadeOutLevel`; `gainEnvelope`, `hasGainEnvelope` |
| `markers.js`, `regions.js` | Markers and regions |
| `apply.js` | `applyDirectorResult` |
| `history.js` | `createHistory` — undo / redo |

Internal building blocks: `time.js`, `immutable.js`, `clipMath.js`,
`fades.js`, `place.js`, `session.js`, `partners.js`, `links.js`,
`shift.js`, `trimLimits.js`, `placement.js`, `overlayClip.js`,
`sanitize.js`, `jsonBag.js`, `keyList.js`, `effectList.js`,
`effectStack.js`, `keyEdit.js`, `clipPatch.js`, `normalizeClip.js`,
`normalizeMarks.js`, `fragment.js`, `validateClip.js`, `validateExtras.js`,
`validateMarks.js`. `types.js` holds the shared JSDoc types (`Edl`, `Track`,
`Clip`, `Effect`, `Keyframe`, `Marker`, `Region`) and `testkit.js` the
fixtures for tests (`testEdl`, `testClip`, `deepFreeze`, `assertValid`).

## Keyframes

Times passed to these operations are **timeline times**; keys are stored in
clip-local source time. New and moved keys land on the frame grid, and "the
key at a time" is the nearest one within half a frame. A path that cannot be
animated in that clip, or a value that does not suit it, changes nothing.

| Operation | What it does |
| --------- | ------------ |
| `setKeyframe(edl, clipId, path, time, value, { ease }?)` | Add a key, or replace the value of the one at that time (its time and, unless given, its easing are kept) |
| `removeKeyframe(edl, clipId, path, time)` | Remove the key at a time. Removing a property's last key leaves the property at that key's value |
| `moveKeyframe(edl, clipId, path, fromTime, toTime)` | Re-time a key; a key at the destination is replaced |
| `setKeyframeEase(edl, clipId, path, time, ease)` | Easing of the segment leaving a key |
| `removeKeyframesAt(edl, clipId, time, paths?)`, `moveKeyframesAt(edl, clipId, fromTime, toTime, paths?)` | The same for every key the clip has at a time — one marker on the timeline |
| `clearKeyframes(edl, clipId, path?)` | Drop the keys of one property or of the whole clip; properties return to their plain values |
| `setValueAt(edl, clipId, path, value, time?)` | Auto-key: writes a key at `time` when the property is animated, the plain value when it is not. Works for every writable field and parameter; `null` removes a plain parameter |
| `setAnimated(edl, clipId, path, on, time?, { value, ease }?)` | On: first key at `time` with the current value (`value` for a parameter that is not stored). Off: keys removed, the property keeps the value it has at `time` |
| `listKeyframes(clip, path?)` | Every key as `{ path, index, time, t, v, ease, inside }`, in timeline order |
| `keyframeTimes(clips, { path, within }?)` | Distinct timeline times of a clip's (or several clips') keys; `within` (default true) keeps only those inside the clip |
| `nextKeyframeTime(clips, time, filter?)`, `previousKeyframeTime(…)` | The key time after / before a time, or `null` |
| `isAnimated(clip, path)`, `keysOf(clip, path)`, `animatedPaths(clip)`, `keyTime(clip, t)`, `describePath(clip, path)` | Queries |

## Effects

A target is `{ clipId }` or `{ trackId }` (a bare string is a clip id).

| Operation | What it does |
| --------- | ------------ |
| `addEffect(edl, target, type, { params, enabled, index, effectId }?)` | Add an effect with a fresh id (or `effectId`, e.g. `newId('fx')`, when it is free) at `index` (default last) |
| `removeEffect(edl, target, effectId)` | Remove it; on a clip the keyframes of its parameters go with it |
| `moveEffect(edl, target, effectId, toIndex)` | Reorder |
| `updateEffect(edl, target, effectId, { params, enabled, type })` | Merge parameters key by key (`null` removes one), set `enabled`, switch `type` |
| `setEffectEnabled(edl, target, effectId, enabled?)` | Enable / disable (toggles without a value) |
| `effectsOf(edl, target)` | The stack |

## Generators, attributes, track settings

| Operation | What it does |
| --------- | ------------ |
| `insertGenerator(edl, { type, params, seed }, { time, duration, trackId, label, autoCrossfade, clip }?)` | Add a generator clip, placed like a title: on the front-most video track when it is free there, otherwise on a new top track; with `trackId` under the normal overlap rules. `clip` is an `updateClip`-style patch for its look |
| `updateGenerator(edl, clipId, { type, seed, params })` | Merge parameters, set the seed, or switch the type (which resets the parameters and drops their keyframes) |
| `updateClip(edl, clipId, patch)` | Also `blendMode`, `fadeInCurve`, `fadeOutCurve`, `generator`, `effects` (whole list), `keyframes` (by path) and the new `text` fields |
| `pasteAttributes(edl, source, clipIds, parts?)` | Copy `transform`, `effects`, `keyframes`, `blendMode`, `fades` and/or `text` style from one clip (id, clip or clipboard payload) onto others |
| `setTrackOpacity`, `setTrackBlendMode`, `updateTrack` | Track compositing settings |
| `gainEnvelope(track, clip, { step, from, to }?)`, `hasGainEnvelope(clip)` | A clip's gain sampled at even steps; whether it needs more than two linear ramps |

## Editing rules

**Locked tracks.** A clip on a locked track is never moved, trimmed, split,
deleted, overwritten, rippled, keyframed or given effects, and nothing is
placed on a locked track. The one field that may change on such a clip is
`linkedClipId`: it is cleared, or re-pointed at the surviving half, when its
partner is deleted, split or cut away (invariant 5). A locked track's own
header settings — opacity, blend mode, effects — stay editable.

**Linked and grouped clips.** Linked partners move, trim, slip, split and
delete together; grouped clips move together. Every such operation takes
`linked: false` (and `moveClips` also `grouped: false`) to edit one clip
alone — that is how J- and L-cuts are made. Effects, keyframes, generator
settings and pasted attributes belong to one clip and are never mirrored to
its partner.

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
the clip to change the cross-fade length. Fade curves are independent of
all this: they stay with the clip and shape whatever fade its edge has.

**Source windows.** Trimming a start moves `sourceIn` by the same amount,
slipping shifts the window, and every cut (split, overwrite, ripple) gives
each piece the part of the window it covers — on every kind of clip, so
footage, keyframes and generator motion never slide against the timeline.
Both halves of a split keep the whole effect stack and every keyframe;
effect ids only have to be unique within a clip, so they are kept.

**Trim limits.** For video and audio, `sourceIn` never goes below 0 and
`sourceOut` never passes the source duration when a `sourceDurations` map
is supplied. A clip keeps at least one frame and stays longer than the
cross-fade on its other edge. Generators, titles, images and placeholders
trim and slip freely: their source is unbounded.

**Splits and cross-fades.** While two clips cross-fade they are fused: a
split at a time inside the cross-fade leaves those two clips alone (a half
would end up inside the other clip). Ripple edits must open every track at
one time, so there a cross-fade under the cut becomes a hard cut: the
outgoing clip ends at that time and the incoming one starts at it. A clip
that only bridges two others — fading in over one and out under the next,
which meet exactly at the cut — is removed by such a cut.

**Ripple.** `rippleDelete` closes the hole a deletion leaves — the time the
deleted clips covered that no remaining clip on their tracks still covers —
on the tracks that lost a clip (`scope: 'track'`) or on every unlocked track
together with the markers (`scope: 'all'`). `rippleInsert` and
`rippleDeleteRange` open or remove time on every unlocked track (or the
given ones). Clips that ripple are incoming clips and follow the overlap
rules above.

**Copy and paste.** A clipboard payload carries whole clips — effects,
keyframes, generator, text, source window — and is sanitised like any
loaded clip when pasted. Pasted and duplicated clips get fresh clip ids and
keep their effect ids.

**Paste attributes.** A pasted block (`transform`, `effects`, `text`)
replaces the target's values. Unless `keyframes` is pasted too, the
target's own keyframes on that block are removed so the pasted values show.
Pasted keys keep their distance from the start of the clip; keys that
address nothing in the target are dropped. Fade lengths are fitted: an edge
that is cross-fading keeps its overlap. With no `parts`, everything is
pasted (the text style only from a title); the words of a title stay.

**Director results.** `applyDirectorResult` normalises the fragment's
clips — v3 fields included — and maps fragment tracks to the Nth track of
their type, creating missing tracks below the existing ones. A fragment
clip keeps its id when that id is free in the document — so clips an action
rewrites in place stay selected — and gets a fresh one when it clashes or
repeats; links and groups inside the fragment are kept either way.

`replace` removes the clips on unlocked tracks and all markers first, and
the tracks adopt the result's layout: each row is named as the result names
it, a row that carries the `trackId` of an existing track stays on that
track (its mute, solo, volume, opacity, effects and lock travel with it),
and tracks the result does not mention follow the rows it does. `append`
starts at the end of the timeline; `prepend` and `insert` ripple-insert the
fragment's length at 0 / `at`; `range` cuts `range` out and ripples later
clips by the difference in length. A locked target track is never written
or renamed — its fragment clips go to a new track. An unknown mode, or a
mode whose position is missing, falls back to `append`.
