/**
 * EDL library — everything the timeline UI, the director and the server
 * need to read and edit a timeline document. Every operation is a pure
 * function `(edl, ...args) => edl` that never mutates its input and shares
 * whatever it did not change. Reference: docs/app-spec/EDL.md.
 * @module utils/edl
 */

// Shapes, defaults and read-only helpers
export * from './factory.js';
export * from './query.js';
export * from './geometry.js';
export * from './levels.js';
export { fadeInLevel, fadeOutLevel } from './fadeCurves.js';
export { ENVELOPE_STEP, gainEnvelope, hasGainEnvelope } from './gainEnvelope.js';
export { EPS, floorToFrame, frameDuration, snap, sourceDurationOf } from './time.js';
export { isTimed, tracksOfType } from './immutable.js';
export { neighbourOverlaps } from './fades.js';

// Loading, saving, checking
export { normalizeEdl } from './normalize.js';
export { fromSavedDocument, toSavedDocument } from './savedDocument.js';
export { validateEdl } from './validate.js';

// Clip operations
export { moveClips } from './move.js';
export { trimClipEnd, trimClipStart } from './trim.js';
export { splitClips } from './split.js';
export { deleteClips, setClipFades, slipClip, updateClip } from './clipEdit.js';
export { settle } from './crossfade.js';

// Ripple
export { rippleDelete, rippleDeleteRange, rippleInsert } from './ripple.js';
export { closeGaps } from './gaps.js';

// Snapping
export { snapCandidates, snapEdges, snapMove, snapTime, snapTimes } from './snap.js';

// Tracks and markers
export {
  addTrack,
  moveTrack,
  nextTrackName,
  removeTrack,
  renameTrack,
  setTrackBlendMode,
  setTrackOpacity,
  setTrackVolume,
  toggleTrackLock,
  toggleTrackMute,
  toggleTrackSolo,
  updateTrack,
} from './trackOps.js';
export { addMarker, moveMarker, removeMarker, renameMarker, updateMarker } from './markers.js';

// Selection, clipboard, inserting
export {
  clipsInRange,
  expandSelection,
  groupClips,
  linkClips,
  newClipIds,
  ungroupClips,
  unlinkClips,
} from './selection.js';
export { copyClips, duplicateClips, pasteClips } from './clipboard.js';
export { insertMedia, insertTitle } from './insert.js';
export { insertGenerator, updateGenerator } from './generator.js';
export { pasteAttributes } from './attributes.js';
export { repairLinks } from './links.js';

// Keyframes: evaluation, operations (timeline times in, clip-local keys stored), queries
export * from './animate.js';
export { describePath } from './clipPaths.js';
export {
  clearKeyframes,
  moveKeyframe,
  moveKeyframesAt,
  removeKeyframe,
  removeKeyframesAt,
  setKeyframe,
  setKeyframeEase,
} from './keyframes.js';
export { setAnimated, setValueAt } from './autoKey.js';
export * from './keyframeQuery.js';

// Effect stacks of clips and tracks
export {
  addEffect,
  effectsOf,
  moveEffect,
  removeEffect,
  setEffectEnabled,
  updateEffect,
} from './effects.js';

// Regions, and the Vegas-style edits: slip-trim, roll, slide, range edits
export {
  addRegion,
  moveRegion,
  regionsOf,
  removeRegion,
  renameRegion,
  resizeRegion,
  retimeRegions,
  updateRegion,
} from './regions.js';
export { rollEdit, slideClip, slipTrim } from './slide.js';
export {
  MAX_REPEATS,
  pasteInsert,
  pasteRepeat,
  replayRippled,
  rippleMarks,
  trimToRange,
} from './selectionEdits.js';

// Director results and undo
export { applyDirectorResult } from './apply.js';
export { createHistory } from './history.js';
