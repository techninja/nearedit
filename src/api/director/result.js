/**
 * DirectorResult — the fragment every director action returns
 * (docs/app-spec/API.md § DirectorResult). The client merges it with
 * `applyDirectorResult` as one undoable step.
 * @module api/director/result
 */

import { snapToFrame, timelineDuration } from '#utils/edl/query.js';

/**
 * @typedef {{ type: string, index: number, name: string, clips: any[] }} FragmentTrack
 * @typedef {Object} DirectorResult
 * @property {'replace'|'append'|'prepend'|'insert'|'range'} mode
 * @property {number} at - Timeline time the fragment starts at (0 for replace/prepend)
 * @property {{ start: number, end: number } | null} range - Set for mode `range`
 * @property {FragmentTrack[]} tracks - Clip times relative to the fragment start
 * @property {object[]} markers - Times relative to the fragment start
 * @property {number} duration - Length of the fragment in seconds
 * @property {string} summary
 * @property {string[]} notes
 * @property {object} plan
 * @property {import('#utils/director/applyResult.js').ResultDocument} [document] - What
 *   the result says about the document itself, beside its clips: font files
 *   its text is set in, the timeline's caption style (`applyDirected`)
 */

/**
 * Index of each track among the tracks of its own type.
 * @param {any} edl
 * @returns {{ track: any, type: 'video'|'audio', index: number }[]}
 */
export function typedTracks(edl) {
  const counts = { video: 0, audio: 0 };
  return (edl?.tracks || []).map((/** @type {any} */ track) => {
    const type = track.type === 'audio' ? 'audio' : 'video';
    return { track, type, index: counts[type]++ };
  });
}

/**
 * For a whole-timeline replace: add an empty entry for every track of the
 * document the fragment does not mention, so nothing stale survives
 * however the client merges.
 * @param {FragmentTrack[]} tracks
 * @param {any} edl - The document being replaced; may be null
 * @returns {FragmentTrack[]}
 */
export function coverDocument(tracks, edl) {
  const out = [...tracks];
  for (const { track, type, index } of typedTracks(edl)) {
    if (out.some((t) => t.type === type && t.index === index)) continue;
    out.push({ type, index, name: track.name || '', clips: [] });
  }
  const rank = (/** @type {FragmentTrack} */ t) => (t.type === 'audio' ? 1000 : 0) + t.index;
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * Wrap a fragment as a DirectorResult for the directive's mode.
 * @param {{ tracks: FragmentTrack[], markers?: object[], summary: string, notes?: string[],
 *   plan?: object }} parts
 * @param {import('#utils/director/directive.js').Directive} directive
 * @param {any} edl - The posted document; may be null
 * @param {number} fps
 * @returns {DirectorResult}
 */
export function directorResult(parts, directive, edl, fps) {
  const mode = /** @type {DirectorResult['mode']} */ (directive.mode || 'replace');
  const { playheadPosition, range } = directive.context;
  const starts = {
    insert: playheadPosition,
    append: edl ? timelineDuration(edl) : 0,
    range: range?.start ?? 0,
  };
  return {
    mode,
    at: snapToFrame(starts[mode] ?? 0, fps),
    range:
      mode === 'range'
        ? { start: snapToFrame(range.start, fps), end: snapToFrame(range.end, fps) }
        : null,
    tracks: mode === 'replace' ? coverDocument(parts.tracks, edl) : parts.tracks,
    markers: parts.markers || [],
    duration: snapToFrame(timelineDuration(parts.tracks), fps),
    summary: parts.summary,
    notes: [...new Set(parts.notes || [])],
    plan: parts.plan || {},
  };
}
