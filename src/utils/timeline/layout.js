/**
 * Vertical layout of the timeline: the ruler on top, then one lane per
 * track in document order (video above audio). The DOM track headers and
 * the canvas lanes both use these numbers so they line up. Pure.
 * @module utils/timeline/layout
 */

/** Height of the ruler, including the loop band on its top edge. */
export const RULER_H = 30;
/** Height of the loop band at the top of the ruler. */
export const LOOP_BAND_H = 10;
/** Lane height with a mouse, and with a finger. */
export const LANE_H = 60;
export const LANE_H_COARSE = 72;
/** Space between lanes (drawn as a grid line). */
export const LANE_GAP = 1;
/** Space between a lane's edge and its clips. */
export const CLIP_INSET = 3;

/**
 * @typedef {Object} Lane
 * @property {string} trackId
 * @property {'video'|'audio'} type
 * @property {number} index - Position in the document's track list
 * @property {number} top - Pixels below the ruler, before scrolling
 * @property {number} height
 */

/**
 * @param {{ trackId: string, type: string }[]} tracks - Document order
 * @param {number} [laneHeight=LANE_H]
 * @returns {Lane[]}
 */
export function layoutLanes(tracks, laneHeight = LANE_H) {
  return tracks.map((track, index) => ({
    trackId: track.trackId,
    type: track.type === 'audio' ? 'audio' : 'video',
    index,
    top: index * (laneHeight + LANE_GAP),
    height: laneHeight,
  }));
}

/**
 * @param {Lane[]} lanes
 * @returns {number} Height of all lanes together
 */
export function lanesHeight(lanes) {
  const last = lanes[lanes.length - 1];
  return last ? last.top + last.height : 0;
}

/**
 * The lane under a canvas y coordinate.
 * @param {Lane[]} lanes
 * @param {number} y - Canvas y in CSS pixels
 * @param {number} [scrollY=0]
 * @returns {Lane|null} null on the ruler, in a gap, or below the last lane
 */
export function laneAt(lanes, y, scrollY = 0) {
  const offset = y - RULER_H + scrollY;
  if (y < RULER_H || offset < 0) return null;
  return lanes.find((lane) => offset >= lane.top && offset < lane.top + lane.height) || null;
}

/**
 * The lane nearest to a y coordinate — used while dragging, where the
 * pointer may be above the first or below the last lane.
 * @param {Lane[]} lanes
 * @param {number} y - Canvas y in CSS pixels
 * @param {number} [scrollY=0]
 * @returns {Lane|null} null only when there are no lanes
 */
export function nearestLane(lanes, y, scrollY = 0) {
  const offset = y - RULER_H + scrollY;
  let best = null;
  let distance = Infinity;
  for (const lane of lanes) {
    const middle = lane.top + lane.height / 2;
    const gap = Math.abs(offset - middle);
    if (gap < distance) {
      distance = gap;
      best = lane;
    }
  }
  return best;
}

/**
 * Canvas y of a lane's top edge.
 * @param {Lane} lane
 * @param {number} [scrollY=0]
 * @returns {number}
 */
export const laneY = (lane, scrollY = 0) => RULER_H + lane.top - scrollY;

/**
 * Track ids of the lanes that a vertical span touches (marquee selection).
 * @param {Lane[]} lanes
 * @param {number} y0 - Canvas y
 * @param {number} y1 - Canvas y
 * @param {number} [scrollY=0]
 * @returns {string[]}
 */
export function lanesBetween(lanes, y0, y1, scrollY = 0) {
  const top = Math.min(y0, y1) - RULER_H + scrollY;
  const bottom = Math.max(y0, y1) - RULER_H + scrollY;
  return lanes
    .filter((lane) => lane.top < bottom && lane.top + lane.height > top)
    .map((lane) => lane.trackId);
}
