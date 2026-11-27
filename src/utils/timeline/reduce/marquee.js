/**
 * Marquee selection as a pure function of the dragged box.
 * @module utils/timeline/reduce/marquee
 */

import { clipsInRange, expandSelection } from '#utils/edl/index.js';

/**
 * @typedef {Object} MarqueeBox
 * @property {number} t0 - Seconds
 * @property {number} t1 - Seconds
 * @property {string[]} trackIds - Tracks the box touches
 */

/**
 * The selection a marquee produces.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {MarqueeBox} box
 * @param {string[]} [initial] - Selection when the drag began
 * @param {boolean} [toggle] - Ctrl/Cmd/Shift held: flip the boxed clips in
 *   `initial` instead of replacing it
 * @returns {string[]} Clip ids, linked and grouped partners included
 */
export function marqueeSelection(doc, box, initial = [], toggle = false) {
  const boxed = box.trackIds.length
    ? expandSelection(doc, clipsInRange(doc, box.t0, box.t1, box.trackIds))
    : [];
  if (!toggle) return boxed;
  const out = new Set(initial);
  for (const id of boxed) {
    if (out.has(id)) out.delete(id);
    else out.add(id);
  }
  return [...out];
}
