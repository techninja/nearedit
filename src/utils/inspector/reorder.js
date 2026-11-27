/**
 * Reordering a vertical list by dragging: which gap between the items the
 * pointer is at, and what that means as a move. Pure and isomorphic.
 * @module utils/inspector/reorder
 */

/**
 * The gap the pointer is nearest to: 0 is above the first item, `n` below
 * the last.
 * @param {number} y - Pointer position
 * @param {{ top: number, bottom: number }[]} rects - The items, top to bottom
 * @returns {number}
 */
export function gapAt(y, rects) {
  return rects.filter((rect) => y > (rect.top + rect.bottom) / 2).length;
}

/**
 * The index an item ends up at when it is dropped into a gap.
 * @param {number} from - Where the item is now
 * @param {number} gap - As `gapAt` counts them
 * @returns {number} Equal to `from` when the drop changes nothing
 */
export function indexAfterDrop(from, gap) {
  return gap > from ? gap - 1 : gap;
}

/**
 * The index a key press moves an item to.
 * @param {number} from
 * @param {string} key - `ArrowUp`, `ArrowDown`, `Home` or `End`
 * @param {number} count - Items in the list
 * @returns {number|null} null when the key does not move it
 */
export function indexAfterKey(from, key, count) {
  const wanted = { ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: count - 1 }[key];
  if (wanted === undefined) return null;
  const to = Math.max(0, Math.min(count - 1, wanted));
  return to === from ? null : to;
}
