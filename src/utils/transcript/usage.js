/**
 * How a source file is used on the timeline, and the mapping between
 * source time (where a word is in the file) and timeline time (where it
 * plays in the edit). The transcript panel works on one *chain*: the clips
 * of one track that play the file, in timeline order — after text cuts that
 * is the original clip in pieces. Linked partners follow through the EDL
 * operations and are not listed. Pure and isomorphic.
 * @module utils/transcript/usage
 */

import { EPS } from '#utils/edl/time.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('./units.js').Unit} Unit */

/**
 * @typedef {Object} ChainSegment
 * @property {string} clipId
 * @property {number} sourceIn
 * @property {number} sourceOut
 * @property {number} timelineStart
 * @property {number} timelineEnd
 */

/**
 * @typedef {Object} Chain
 * @property {string} file - Absolute path of the source
 * @property {string} trackId - '' when the file is not on the timeline
 * @property {boolean} locked - The track is locked: nothing can be edited
 * @property {ChainSegment[]} segments - In timeline order
 */

/** Word state codes of `unitStates`. */
export const OFF = 0;
export const ON = 1;
export const FOCUS = 2;

/**
 * The chain of a file: its clips on the focus clip's track, else on the
 * preferred track, else on the first track that uses the file.
 * @param {Edl} edl
 * @param {string} file
 * @param {{ focusClipId?: string, trackId?: string }} [prefer]
 * @returns {Chain}
 */
export function sourceChain(edl, file, prefer = {}) {
  const using = (edl?.tracks || []).filter(
    (track) => file && track.clips.some((clip) => clip.sourceFile === file),
  );
  const holds = (/** @type {any} */ track) =>
    track.clips.some((clip) => clip.clipId === prefer.focusClipId && clip.sourceFile === file);
  const track =
    using.find(holds) || using.find((t) => t.trackId === prefer.trackId) || using[0] || null;
  if (!track) return { file, trackId: '', locked: false, segments: [] };
  const segments = track.clips
    .filter((clip) => clip.sourceFile === file)
    .map(({ clipId, sourceIn, sourceOut, timelineStart, timelineEnd }) => ({
      clipId,
      sourceIn,
      sourceOut,
      timelineStart,
      timelineEnd,
    }));
  return { file, trackId: track.trackId, locked: !!track.locked, segments };
}

/**
 * Where a moment of the source plays on the timeline.
 * @param {ChainSegment[]} segments
 * @param {number} sourceTime
 * @param {string} [preferClipId] - Wins when several pieces show that moment
 * @returns {{ time: number, clipId: string }|null} null when it was cut or trimmed away
 */
export function sourceToTimeline(segments, sourceTime, preferClipId = '') {
  const holding = segments.filter(
    (seg) => sourceTime >= seg.sourceIn - EPS && sourceTime < seg.sourceOut - EPS,
  );
  const seg = holding.find((s) => s.clipId === preferClipId) || holding[0];
  return seg ? { time: seg.timelineStart + (sourceTime - seg.sourceIn), clipId: seg.clipId } : null;
}

/**
 * Which moment of the source is playing at a timeline time.
 * @param {ChainSegment[]} segments
 * @param {number} time
 * @returns {{ sourceTime: number, clipId: string }|null} null in a gap or outside the chain
 */
export function timelineToSource(segments, time) {
  // During a cross-fade two pieces overlap: the incoming (later) one wins.
  const seg = segments.findLast((s) => time >= s.timelineStart - EPS && time < s.timelineEnd - EPS);
  return seg ? { sourceTime: seg.sourceIn + (time - seg.timelineStart), clipId: seg.clipId } : null;
}

/**
 * For every unit: is it in the edit? A unit counts as present in the piece
 * that holds its midpoint.
 * @param {Unit[]} units
 * @param {ChainSegment[]} segments
 * @param {string} [focusClipId]
 * @returns {number[]} `OFF` (cut or trimmed away), `ON`, or `FOCUS` (in the focus clip)
 */
export function unitStates(units, segments, focusClipId = '') {
  return units.map((unit) => {
    const mid = (unit.start + unit.end) / 2;
    let state = OFF;
    for (const seg of segments) {
      if (mid < seg.sourceIn - EPS || mid >= seg.sourceOut - EPS) continue;
      if (seg.clipId === focusClipId) return FOCUS;
      state = ON;
    }
    return state;
  });
}
