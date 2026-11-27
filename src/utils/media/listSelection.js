/**
 * Multi-selection in a list: plain click, ctrl-click toggle, shift-click
 * range. The selection keeps the order in which files were picked, which is
 * the order they are added to the timeline in. Pure and isomorphic.
 * @module utils/media/listSelection
 */

/**
 * @typedef {Object} ListSelection
 * @property {string[]} selected - Keys in the order they were picked
 * @property {string} anchor - Where a shift-click range starts from
 */

/**
 * The selection after clicking one row.
 * @param {string[]} order - Every visible key, in display order
 * @param {ListSelection} current
 * @param {string} key - The row that was clicked
 * @param {{ toggle?: boolean, range?: boolean }} [mods] - ctrl/cmd, shift
 * @returns {ListSelection}
 */
export function clickSelection(order, current, key, mods = {}) {
  if (mods.range && current.anchor && order.includes(current.anchor)) {
    const from = order.indexOf(current.anchor);
    const to = order.indexOf(key);
    if (to < 0) return current;
    const span = from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1).reverse();
    return { selected: span, anchor: current.anchor };
  }
  if (mods.toggle) {
    const selected = current.selected.includes(key)
      ? current.selected.filter((k) => k !== key)
      : [...current.selected, key];
    return { selected, anchor: key };
  }
  return { selected: [key], anchor: key };
}

/**
 * Move the selection one row up or down (arrow keys).
 * @param {string[]} order
 * @param {ListSelection} current
 * @param {number} step - -1 up, 1 down
 * @param {boolean} [extend=false] - Shift held: grow the range instead
 * @returns {ListSelection}
 */
export function stepSelection(order, current, step, extend = false) {
  if (!order.length) return current;
  const last = current.selected[current.selected.length - 1];
  const at = order.indexOf(last);
  const next = order[Math.min(order.length - 1, Math.max(0, at < 0 ? 0 : at + step))];
  if (!extend) return { selected: [next], anchor: next };
  return clickSelection(order, { ...current, anchor: current.anchor || next }, next, {
    range: true,
  });
}

/**
 * Drop keys that are no longer in the list (after a reload or a new filter).
 * @param {string[]} order
 * @param {ListSelection} current
 * @returns {ListSelection} The same object when nothing was dropped
 */
export function pruneSelection(order, current) {
  const known = new Set(order);
  const selected = current.selected.filter((key) => known.has(key));
  if (selected.length === current.selected.length) return current;
  return { selected, anchor: known.has(current.anchor) ? current.anchor : '' };
}
