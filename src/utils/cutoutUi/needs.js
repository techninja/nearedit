/**
 * A stretch of a media file, as the document needs it cut out and as the
 * server was asked for it: whether one holds the other, and a name for one
 * to remember it by. Pure and isomorphic.
 * @module utils/cutoutUi/needs
 */

/**
 * What to ask the server for: one of `cutoutNeeds(edl)`.
 * @typedef {Object} Need
 * @property {string} path - The media file, absolute
 * @property {number} start - Seconds into it, on the frame grid
 * @property {number} end
 * @property {number} fps - Of the document
 * @property {string[]} [clips] - The clips it is for
 */

const NEAR = 1e-6;

/**
 * @param {Pick<Need, 'start'|'end'|'fps'>} need
 * @returns {string} The same for the same stretch at the same rate
 */
export const rangeKey = (need) => `${need.start.toFixed(4)}-${need.end.toFixed(4)}@${need.fps}`;

/**
 * @param {Pick<Need, 'start'|'end'|'fps'>} asked - What was asked for, or made
 * @param {Pick<Need, 'start'|'end'|'fps'>} need
 * @returns {boolean} True when it holds everything that is needed
 */
export const covers = (asked, need) =>
  asked.fps === need.fps && asked.start <= need.start + NEAR && need.end <= asked.end + NEAR;
