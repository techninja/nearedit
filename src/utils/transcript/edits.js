/**
 * Editing by text: a range of transcript words becomes ordinary timeline
 * edits — cut, keep only, add as a new clip, add a marker. Every function
 * returns a new document; the caller commits it as one undo step.
 * Isomorphic and pure.
 * @module utils/transcript/edits
 */

import { insertMedia } from '#utils/edl/insert.js';
import { addMarker } from '#utils/edl/markers.js';
import { findClip } from '#utils/edl/query.js';
import { rippleDelete } from '#utils/edl/ripple.js';
import { EPS } from '#utils/edl/time.js';
import { trimClipEnd, trimClipStart } from '#utils/edl/trim.js';
import { applyCuts } from './cutRange.js';
import { sourceToTimeline } from './usage.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('./units.js').Unit} Unit */
/** @typedef {import('./usage.js').Chain} Chain */
/** @typedef {{ start: number, end: number }} Span - Source seconds */

/** Sound kept after the last word of a kept or added range. */
export const TAIL = 0.12;

/**
 * The source range a cut of units `first..last` removes: from where the
 * first word's region begins to where the next word's begins, so the pause
 * that followed the words goes with them and the one before them stays.
 * @param {Unit[]} units
 * @param {number[]} edges - `unitEdges(units)`
 * @param {number} first
 * @param {number} last
 * @returns {Span}
 */
export function cutSpan(units, edges, first, last) {
  const end = last + 1 < units.length ? edges[last + 1] : units[last].end + TAIL;
  return { start: edges[first], end };
}

/**
 * The source range that holds units `first..last` and nothing else: a
 * short tail after the last word, never reaching into the next one.
 * @param {Unit[]} units
 * @param {number[]} edges
 * @param {number} first
 * @param {number} last
 * @returns {Span}
 */
export function keepSpan(units, edges, first, last) {
  const limit = last + 1 < units.length ? edges[last + 1] : Infinity;
  return { start: edges[first], end: Math.min(units[last].end + TAIL, limit) };
}

/**
 * Remove a source range from every piece of the chain, rippling.
 * @param {Edl} edl
 * @param {Chain} chain
 * @param {Span} span
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function cutSource(edl, chain, span, opts = {}) {
  const cuts = [];
  for (const seg of chain.segments) {
    const from = Math.max(span.start, seg.sourceIn);
    const to = Math.min(span.end, seg.sourceOut);
    if (to - from <= EPS) continue;
    const at = (/** @type {number} */ source) => seg.timelineStart + (source - seg.sourceIn);
    cuts.push({ clipId: seg.clipId, from: at(from), to: at(to) });
  }
  return applyCuts(edl, cuts, opts);
}

/**
 * Keep only a source range: pieces of the chain outside it are removed,
 * pieces that cross its edges are trimmed to it, and the timeline closes
 * up. Trimmed clips keep their ids (and so the selection).
 * @param {Edl} edl
 * @param {Chain} chain
 * @param {Span} span
 * @param {{ autoCrossfade?: boolean, sourceDurations?: import('#utils/edl/types.js').SourceDurations }} [opts]
 * @returns {Edl}
 */
export function keepSource(edl, chain, span, opts = {}) {
  const ripple = { ...opts, ripple: true, rippleScope: /** @type {'all'} */ ('all') };
  let doc = edl;
  for (const seg of [...chain.segments].reverse()) {
    const from = Math.max(span.start, seg.sourceIn);
    const to = Math.min(span.end, seg.sourceOut);
    if (to - from <= EPS) {
      doc = rippleDelete(doc, [seg.clipId], { scope: 'all', autoCrossfade: opts.autoCrossfade });
      continue;
    }
    if (seg.sourceOut - to > EPS)
      doc = trimClipEnd(doc, seg.clipId, seg.timelineEnd - (seg.sourceOut - to), ripple);
    if (from - seg.sourceIn > EPS)
      doc = trimClipStart(doc, seg.clipId, seg.timelineStart + (from - seg.sourceIn), ripple);
  }
  return doc;
}

/**
 * Insert a source range as a new clip (with linked sound for video).
 * @param {Edl} edl
 * @param {any} item - MediaItem of the source (docs/app-spec/API.md § Media)
 * @param {Span} span
 * @param {import('#utils/edl/insert.js').InsertMediaOptions} [opts] - `time`, `trackId`, `ripple`…
 * @returns {Edl}
 */
export function insertSourceRange(edl, item, span, opts = {}) {
  const sourceIn = Math.max(0, span.start);
  return insertMedia(edl, item, { ...opts, sourceIn, sourceOut: span.end });
}

/**
 * Put a marker where a source moment plays on the timeline.
 * @param {Edl} edl
 * @param {Chain} chain
 * @param {number} sourceTime
 * @param {string} label
 * @param {string} [preferClipId]
 * @returns {Edl} Unchanged when that moment is not in the edit
 */
export function markSource(edl, chain, sourceTime, label, preferClipId = '') {
  const at = sourceToTimeline(chain.segments, sourceTime, preferClipId);
  if (!at || !findClip(edl, at.clipId)) return edl;
  return addMarker(edl, at.time, { label: label.length > 48 ? `${label.slice(0, 47)}…` : label });
}
