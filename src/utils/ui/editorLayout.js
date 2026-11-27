/**
 * Dragging the editor's splitters. The page hands in its grid element;
 * sizes are measured from the real panes (the stylesheet may have clamped
 * a stored size), applied live as CSS custom properties, and stored in
 * AppState when the drag ends. The maths is in `layout.js`.
 * @module utils/ui/editorLayout
 */

import { setAppState } from '#store/AppState.js';
import { clampSize, draggedSize, keyDelta, paneRange } from '#utils/ui/layout.js';

/** @typedef {import('#utils/ui/layout.js').PaneName} PaneName */

/** Per pane: its element, the CSS variable and AppState field, the drag direction. */
const PANES = {
  dock: {
    selector: '.editor-view-dock',
    css: '--editor-dock',
    key: 'dockWidth',
    axis: 'width',
    grows: 1,
  },
  timeline: {
    selector: '.editor-view-timeline',
    css: '--editor-timeline',
    key: 'timelineHeight',
    axis: 'height',
    grows: -1,
  },
  sheet: {
    selector: '.editor-view-dock',
    css: '--editor-sheet',
    key: 'sheetHeight',
    axis: 'height',
    grows: -1,
  },
};

/** @type {WeakMap<HTMLElement, { pane: PaneName, start: number, size: number, range: import('#utils/ui/layout.js').SizeRange }>} */
const drags = new WeakMap();

/**
 * Current size of a pane and the range it may take.
 * @param {HTMLElement} grid - The `.editor-view` element
 * @param {PaneName} pane
 * @returns {{ size: number, range: import('#utils/ui/layout.js').SizeRange }}
 */
function measure(grid, pane) {
  const { selector, axis } = PANES[pane];
  const size = grid.querySelector(selector)?.getBoundingClientRect()[axis] || 0;
  const fixed = [...grid.querySelectorAll('.editor-view-bar, .editor-view-tabbar')]
    .filter((el) => pane !== 'timeline' || el.classList.contains('editor-view-bar'))
    .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  const available = pane === 'dock' ? grid.clientWidth : grid.clientHeight - fixed;
  return { size, range: paneRange(pane, available) };
}

/**
 * @param {HTMLElement} grid
 * @param {PaneName} pane
 * @param {number} size - px
 */
function apply(grid, pane, size) {
  grid.style.setProperty(PANES[pane].css, `${size}px`);
}

/**
 * A drag on a splitter begins.
 * @param {HTMLElement} grid
 * @param {PaneName} pane
 */
export function beginPaneDrag(grid, pane) {
  const { size, range } = measure(grid, pane);
  drags.set(grid, { pane, start: size, size, range });
}

/**
 * The pointer moved.
 * @param {HTMLElement} grid
 * @param {number} delta - px travelled since the drag began, along the splitter's axis
 */
export function movePaneDrag(grid, delta) {
  const drag = drags.get(grid);
  if (!drag) return;
  drag.size = draggedSize(
    drag.start,
    delta,
    { grows: /** @type {1|-1} */ (PANES[drag.pane].grows) },
    drag.range,
  );
  apply(grid, drag.pane, drag.size);
}

/**
 * The drag ended: remember the size.
 * @param {HTMLElement} grid
 */
export function endPaneDrag(grid) {
  const drag = drags.get(grid);
  drags.delete(grid);
  if (drag && drag.size !== drag.start) setAppState({ [PANES[drag.pane].key]: drag.size });
}

/**
 * Resize with the keyboard (arrow keys on a focused splitter).
 * @param {HTMLElement} grid
 * @param {PaneName} pane
 * @param {string} key
 * @returns {boolean} true when the key resized the pane
 */
export function nudgePane(grid, pane, key) {
  const delta = keyDelta(key, pane);
  if (!delta) return false;
  const { size, range } = measure(grid, pane);
  const next = clampSize(size + delta, range);
  apply(grid, pane, next);
  setAppState({ [PANES[pane].key]: next });
  return true;
}

/**
 * Back to the stylesheet's default size (double-click on a splitter).
 * @param {HTMLElement} grid
 * @param {PaneName} pane
 */
export function resetPane(grid, pane) {
  grid.style.removeProperty(PANES[pane].css);
  setAppState({ [PANES[pane].key]: 0 });
}

/**
 * Serve an event of an `<app-splitter>` whose `data-pane` names its pane.
 * @param {HTMLElement} grid
 * @param {CustomEvent} event - splitstart | splitmove | splitend | splitkey | splitreset
 */
export function handleSplitEvent(grid, event) {
  const pane = /** @type {PaneName} */ (/** @type {HTMLElement} */ (event.target).dataset.pane);
  if (event.type === 'splitstart') beginPaneDrag(grid, pane);
  else if (event.type === 'splitmove') movePaneDrag(grid, event.detail.delta);
  else if (event.type === 'splitend') endPaneDrag(grid);
  else if (event.type === 'splitkey') nudgePane(grid, pane, event.detail.key);
  else if (event.type === 'splitreset') resetPane(grid, pane);
}
