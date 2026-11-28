/**
 * What the clip of every layer has, whatever it draws: an id, its time, its
 * blend mode, its opacity. Isomorphic and pure.
 * @module utils/brand/element/clipParts
 */

import { BLEND_MODES } from '#utils/edl/defaults.js';
import { num } from './measure.js';

/**
 * @typedef {import('./layout.js').Placed} Placed
 * @typedef {import('./timing.js').Timing} Timing
 * @typedef {{ frame: { width: number, height: number }, unit: number,
 *   groups: Record<string, any> }} ClipEnv
 */

/** A transform that leaves a frame-sized picture where it is. */
export const STILL = { x: 0, y: 0, scale: 1, px: 0, py: 0 };

/**
 * What every layer's clip has: its id, its time, its blend mode, its opacity.
 * @param {Record<string, any>} layer
 * @param {Timing} timing
 * @returns {{ head: Record<string, any>, opacity: number, rotation: number }}
 */
export function common(layer, timing) {
  const head = {
    clipId: `el-${layer.id}`,
    label: layer.id,
    timelineStart: timing.start,
    timelineEnd: timing.end,
    sourceIn: timing.start,
    sourceOut: timing.end,
    blendMode: BLEND_MODES.includes(layer.blend) ? layer.blend : 'normal',
  };
  return {
    head,
    opacity: num(layer.opacity, 1, 0, 1),
    rotation: num(layer.rotate, 0, -3600, 3600),
  };
}
