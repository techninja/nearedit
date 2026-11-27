/**
 * What the timeline marks on a clip beyond its body: the colours of a
 * generator (a small swatch tells generators apart without drawing them),
 * whether it has effects that are switched on, and where its keyframes
 * sit. Also what marks a track as composited specially. Pure and
 * isomorphic; results are remembered per (immutable) document object.
 * @module utils/timeline/clipMarks
 */

import { generatorModule } from '#utils/compose/catalog.js';
import { resolveParams } from '#utils/compose/params.js';
import { animatedPaths, keyframeTimes } from '#utils/edl/keyframeQuery.js';
import { isShown } from '#utils/inspector/paramControls.js';

/** A clip narrower than this, in pixels, shows no keyframes. */
export const KEY_MIN_WIDTH = 24;
/** Keyframes closer than this, in pixels, are drawn as one. */
export const KEY_MIN_GAP = 7;
/** Height of the band along the bottom of a clip where keyframes sit and are hit. */
export const KEY_BAND = 12;
/** Colours shown in a generator's swatch at most. */
const MAX_COLORS = 4;

/** @type {WeakMap<object, string[]>} */
const swatches = new WeakMap();

/**
 * The colours a generator is set to, in schema order: its colour
 * parameters that apply (stored value or default).
 * @param {{ type?: string, params?: Record<string, any> }} generator - A clip's `generator`
 * @returns {string[]} Up to four hex colours
 */
export function generatorColors(generator) {
  if (!generator?.type) return [];
  if (swatches.has(generator)) return swatches.get(generator);
  const schema = generatorModule(generator.type)?.params || {};
  const values = resolveParams(schema, generator.params);
  const colors = Object.entries(schema)
    .filter(([, param]) => param.type === 'color' && isShown(param.when, values))
    .map(([name]) => values[name])
    .filter((color, i, all) => all.indexOf(color) === i)
    .slice(0, MAX_COLORS);
  swatches.set(generator, colors);
  return colors;
}

/**
 * The name of a generator clip when it has no label of its own.
 * @param {{ type?: string }} generator
 * @returns {string}
 */
export const generatorLabel = (generator) =>
  generatorModule(generator?.type)?.label || generator?.type || '';

/** @type {(effects: any[]|undefined) => boolean} */
const anyEnabled = (effects) => (effects || []).some((fx) => fx && fx.enabled !== false);

/**
 * @param {{ effects?: any[] }} clip
 * @returns {boolean} True when the clip has an effect that is switched on
 */
export const hasActiveEffects = (clip) => anyEnabled(clip.effects);

/**
 * @param {{ type?: string, effects?: any[], opacity?: number, blendMode?: string }} track
 * @returns {boolean} True when a video track is composited on its own:
 *   effects, an opacity below 1 or a blend mode
 */
export function trackIsProcessed(track) {
  if (track.type !== 'video') return false;
  const blended = Boolean(track.blendMode) && track.blendMode !== 'normal';
  return anyEnabled(track.effects) || (track.opacity ?? 1) < 1 || blended;
}

/**
 * The timeline times of the keyframe marks a clip shows at a zoom: its key
 * times inside the clip, with marks that would touch drawn as one.
 * @param {any} clip
 * @param {number} pps - Pixels per second
 * @returns {number[]} Ascending; empty when the clip is too narrow
 */
export function keyMarks(clip, pps) {
  if (!animatedPaths(clip).length) return [];
  if ((clip.timelineEnd - clip.timelineStart) * pps < KEY_MIN_WIDTH) return [];
  /** @type {number[]} */
  const marks = [];
  for (const time of keyframeTimes(clip)) {
    const last = marks[marks.length - 1];
    if (last === undefined || (time - last) * pps >= KEY_MIN_GAP) marks.push(time);
  }
  return marks;
}

/**
 * The keyframe mark of a clip nearest to a time.
 * @param {any} clip
 * @param {number} time - Timeline seconds under the pointer
 * @param {number} pps
 * @param {number} reach - How far, in pixels, the pointer may be from the mark
 * @returns {number|null} The mark's time
 */
export function keyMarkAt(clip, time, pps, reach) {
  let best = null;
  for (const mark of keyMarks(clip, pps)) {
    const gap = Math.abs(mark - time) * pps;
    if (gap <= reach && (best === null || gap < Math.abs(best - time) * pps)) best = mark;
  }
  return best;
}
