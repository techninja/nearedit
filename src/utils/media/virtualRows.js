/**
 * Windowing for long fixed-height lists: which rows to render for a scroll
 * position, so a bin with thousands of files stays as light as one with ten.
 * Pure and isomorphic.
 * @module utils/media/virtualRows
 */

/**
 * @typedef {Object} RowWindow
 * @property {number} first - Index of the first row to render
 * @property {number} last - Index after the last row to render
 * @property {number} offset - Pixels from the top of the list to row `first`
 * @property {number} height - Pixel height of the whole list
 */

/**
 * @param {{ count: number, rowHeight: number, scrollTop: number,
 *   viewportHeight: number, overscan?: number }} view - `overscan` is the
 *   number of extra rows kept above and below the viewport
 * @returns {RowWindow}
 */
export function rowWindow(view) {
  const { count, rowHeight, overscan = 6 } = view;
  const height = Math.max(0, count) * rowHeight;
  if (!(count > 0) || !(rowHeight > 0)) return { first: 0, last: 0, offset: 0, height: 0 };
  const viewport = Math.max(rowHeight, view.viewportHeight || 0);
  const top = Math.min(Math.max(0, view.scrollTop || 0), Math.max(0, height - viewport));
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((top + viewport) / rowHeight) + overscan);
  return { first, last, offset: first * rowHeight, height };
}

/**
 * Scroll position that brings a row into view with the least movement.
 * @param {number} index
 * @param {{ rowHeight: number, scrollTop: number, viewportHeight: number }} view
 * @returns {number} The new scrollTop (unchanged when the row is visible)
 */
export function scrollToRow(index, view) {
  const top = index * view.rowHeight;
  if (top < view.scrollTop) return top;
  const bottom = top + view.rowHeight;
  if (bottom > view.scrollTop + view.viewportHeight) return bottom - view.viewportHeight;
  return view.scrollTop;
}
