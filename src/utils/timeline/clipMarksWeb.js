/**
 * What the timeline marks on a web clip: the name it goes by, whether it
 * still needs recording, and where its steps begin (ticks along the clip).
 * A tick is at `timelineStart + (time − sourceIn)`, so it stays with the
 * picture through trims and splits. Pure and isomorphic.
 * @module utils/timeline/clipMarksWeb
 */

import { hostOf, isStale, isWebClip, stepMarks } from '#utils/web/index.js';

/** A clip narrower than this, in pixels, shows no step ticks. */
export const TICK_MIN_WIDTH = 24;
/** Ticks closer than this, in pixels, are drawn as one. */
export const TICK_MIN_GAP = 5;
/** A tick with at least this much room after it, in pixels, shows its label. */
export const TICK_LABEL_ROOM = 34;

const EPS = 1e-6;

/**
 * The name shown on a web clip: a label somebody gave it, else the page's
 * title once a recording has told it, else the host of the address (which
 * is also the label a new web clip starts with).
 * @param {any} clip - A web clip
 * @returns {string}
 */
export function webLabel(clip) {
  const host = hostOf(clip.web.recipe.url);
  if (clip.label && clip.label !== host) return clip.label;
  return clip.web.title || host || clip.label || 'Web page';
}

/**
 * @param {any} clip
 * @param {number} fps
 * @returns {''|'unrecorded'|'stale'} What a web clip still lacks: any
 *   recording, or one of its recipe as it is now. '' for a clip that is
 *   fine, and for one that is not a web clip
 */
export function webMark(clip, fps) {
  if (!isWebClip(clip)) return '';
  if (!clip.web.key || !clip.sourceFile) return 'unrecorded';
  return isStale(clip, fps) ? 'stale' : '';
}

/**
 * @typedef {Object} WebTick
 * @property {number} time - Timeline seconds
 * @property {string} label - What the step does
 * @property {number} index - The step
 * @property {number} room - Pixels to the next tick, or to the end of the clip
 */

/**
 * The step ticks a web clip shows at a zoom: its steps that begin inside
 * the clip, with ticks that would touch drawn as one (the first of them).
 * @param {any} clip
 * @param {number} fps
 * @param {number} pps - Pixels per second
 * @returns {WebTick[]} In time order; empty when the clip is too narrow
 */
export function webTicks(clip, fps, pps) {
  if (!isWebClip(clip)) return [];
  if ((clip.timelineEnd - clip.timelineStart) * pps < TICK_MIN_WIDTH) return [];
  /** @type {WebTick[]} */
  const ticks = [];
  for (const mark of stepMarks(clip, fps)) {
    const time = clip.timelineStart + (mark.time - clip.sourceIn);
    if (time < clip.timelineStart - EPS || time >= clip.timelineEnd - EPS) continue;
    const last = ticks[ticks.length - 1];
    if (last && (time - last.time) * pps < TICK_MIN_GAP) continue;
    ticks.push({ time, label: mark.label, index: mark.index, room: 0 });
  }
  ticks.forEach((tick, i) => {
    const until = ticks[i + 1] ? ticks[i + 1].time : clip.timelineEnd;
    tick.room = (until - tick.time) * pps;
  });
  return ticks;
}

/**
 * The step tick of a web clip nearest to a time.
 * @param {any} clip
 * @param {number} fps
 * @param {number} time - Timeline seconds under the pointer
 * @param {number} pps
 * @param {number} reach - How far, in pixels, the pointer may be from the tick
 * @returns {WebTick|null}
 */
export function webTickAt(clip, fps, time, pps, reach) {
  let best = null;
  for (const tick of webTicks(clip, fps, pps)) {
    const gap = Math.abs(tick.time - time) * pps;
    if (gap <= reach && (!best || gap < Math.abs(best.time - time) * pps)) best = tick;
  }
  return best;
}
