/**
 * The summary of a document that `TimelineState` carries: the few facts
 * components show without walking the document, and the revision that
 * tells them it changed. Pure.
 * @module utils/editor/summary
 */

import { timelineDuration } from '#utils/edl/query.js';

/** @typedef {import('#store/TimelineState.js').TimelineStateShape} TimelineSummary */

/**
 * @param {any} doc - An EDL document
 * @param {number} [revision=0] - Number of this summary; the first document is 0
 * @returns {TimelineSummary}
 */
export function summarize(doc, revision = 0) {
  const tracks = doc.tracks || [];
  return {
    revision,
    fps: doc.fps || 30,
    resolution: doc.resolution || '1920x1080',
    duration: timelineDuration(tracks),
    trackCount: tracks.length,
    clipCount: tracks.reduce((count, track) => count + (track.clips || []).length, 0),
  };
}
