/**
 * Transcript windowing — fit a long transcript into a character budget by
 * showing coherent stretches spread through the file (and around anything
 * that matches the request), with markers for what was left out. Segment
 * numbers stay those of the full transcript, so a plan can still cite them.
 * @module api/director/context/window
 */

import { matchScore } from '#utils/director/keywords.js';
import { formatSeconds } from '#utils/director/snap.js';

const MAX_SEGMENT_CHARS = 240;
const GAP_MARKER_COST = 48;

/**
 * @param {number} seconds
 * @returns {string} Seconds with one decimal, as shown to the LLM
 */
export function stamp(seconds) {
  return (Math.round(seconds * 10) / 10).toFixed(1);
}

/**
 * @param {{ start: number, end: number, text: string }} segment
 * @param {number} index - Zero-based
 * @returns {string}
 */
function segmentLine(segment, index) {
  const text =
    segment.text.length > MAX_SEGMENT_CHARS
      ? `${segment.text.slice(0, MAX_SEGMENT_CHARS - 1)}…`
      : segment.text;
  return `    s${index + 1} [${stamp(segment.start)}-${stamp(segment.end)}] ${text}`;
}

/**
 * Where windows start: the segments that best match the request, then
 * evenly spaced positions through the transcript.
 * @param {{ text: string }[]} segments
 * @param {number} count
 * @param {string[]} focus - Query tokens
 * @returns {number[]} Distinct segment indexes
 */
function chooseAnchors(segments, count, focus) {
  const anchors = [];
  if (focus.length) {
    const hits = segments
      .map((seg, index) => ({ index, score: matchScore(focus, seg.text).score }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    for (const hit of hits.slice(0, Math.ceil(count / 2))) anchors.push(hit.index);
  }
  for (let k = 0; anchors.length < count && k < count; k++) {
    const index = Math.min(segments.length - 1, Math.floor(((k + 0.5) / count) * segments.length));
    if (!anchors.includes(index)) anchors.push(index);
  }
  return anchors;
}

/**
 * Pick the transcript lines to show within `budget` characters.
 * @param {{ start: number, end: number, text: string }[]} segments
 * @param {number} budget - Characters available for this transcript
 * @param {string[]} [focus] - Tokens of the user's request
 * @returns {{ lines: string[], shown: number, total: number }}
 */
export function windowSegments(segments, budget, focus = []) {
  const lines = segments.map(segmentLine);
  const costs = lines.map((l) => l.length + 1);
  const total = costs.reduce((a, b) => a + b, 0);
  if (total <= budget) return { lines, shown: segments.length, total: segments.length };

  const average = total / segments.length;
  const count = Math.max(1, Math.min(10, Math.round(budget / (average * 6))));
  let left = budget - count * GAP_MARKER_COST;
  const shown = new Set();
  const take = (/** @type {number} */ i) => {
    if (i < 0 || i >= segments.length || shown.has(i) || costs[i] > left) return false;
    shown.add(i);
    left -= costs[i];
    return true;
  };
  const windows = chooseAnchors(segments, count, focus)
    .filter(take)
    .map((i) => ({ lo: i, hi: i }));
  // Grow every window one segment at a time, later context first.
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of windows) {
      if (take(w.hi + 1)) {
        w.hi++;
        grew = true;
      }
      if (take(w.lo - 1)) {
        w.lo--;
        grew = true;
      }
    }
  }

  const out = [];
  let gapFrom = 0;
  const closeGap = (/** @type {number} */ until) => {
    if (until <= gapFrom) return;
    const span = formatSeconds(segments[until - 1].end - segments[gapFrom].start);
    const range = until - gapFrom === 1 ? `s${until}` : `s${gapFrom + 1}–s${until}`;
    out.push(`    … ${range} not shown (${span})`);
  };
  for (let i = 0; i < segments.length; i++) {
    if (!shown.has(i)) continue;
    closeGap(i);
    out.push(lines[i]);
    gapFrom = i + 1;
  }
  closeGap(segments.length);
  return { lines: out, shown: shown.size, total: segments.length };
}
