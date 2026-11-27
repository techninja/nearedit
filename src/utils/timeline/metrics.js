/**
 * Size of the timeline's lane area on screen. The stage reports it on every
 * resize; commands (zoom to fit, zoom about the centre), the scrollbars and
 * the track headers read it. There is one timeline in the editor, so one
 * shared record is enough.
 * @module utils/timeline/metrics
 */

import { LANE_H } from './layout.js';

/**
 * @typedef {Object} StageSize
 * @property {number} width - Canvas width, CSS pixels (0 before the timeline is on screen)
 * @property {number} height - Canvas height including the ruler
 * @property {number} laneHeight - Height of one track lane
 */

/** @type {StageSize} */
let size = { width: 0, height: 0, laneHeight: LANE_H };
/** @type {Set<(size: StageSize) => void>} */
const listeners = new Set();

/** @returns {StageSize} */
export const getStageSize = () => size;

/**
 * Report the stage size (called by the stage).
 * @param {StageSize} next
 */
export function setStageSize(next) {
  const same =
    next.width === size.width && next.height === size.height && next.laneHeight === size.laneHeight;
  if (same) return;
  size = { ...next };
  for (const listener of listeners) listener(size);
}

/**
 * @param {(size: StageSize) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onStageSize(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
