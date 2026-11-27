/**
 * Editor layout maths — how big the dock, the timeline and the narrow
 * layout's bottom sheet may be. Pure: the editor page feeds in measured
 * sizes and stores what comes out. The same limits are written as CSS
 * clamps in editor-view.css so a stored size from a bigger window still fits.
 * @module utils/ui/layout
 */

/** Below this viewport width the editor stacks (matches the CSS breakpoint). */
export const NARROW_BELOW = 760;
/** Thickness of a splitter in px. */
export const SPLITTER = 6;
/** Pixels one arrow-key press moves a splitter. */
export const KEY_STEP = 16;

/**
 * Limits in px. `rest` is what must be left for the panes on the other side
 * of the splitter, so no pane can be dragged down to nothing.
 */
export const LIMITS = {
  dock: { min: 240, rest: 320 },
  timeline: { min: 144, rest: 200 },
  sheet: { min: 128, rest: 208 },
};

/** @typedef {'dock'|'timeline'|'sheet'} PaneName */
/** @typedef {{ min: number, max: number }} SizeRange */

/**
 * The range a pane may take inside a container.
 * @param {PaneName} pane
 * @param {number} available - Width (dock) or height (timeline, sheet) the
 *   pane shares with its neighbours, in px
 * @returns {SizeRange}
 */
export function paneRange(pane, available) {
  const { min, rest } = LIMITS[pane];
  return { min, max: Math.max(min, Math.floor(available - rest - SPLITTER)) };
}

/**
 * @param {number} size
 * @param {SizeRange} range
 * @returns {number} Whole pixels inside the range
 */
export function clampSize(size, range) {
  if (!Number.isFinite(size)) return range.min;
  return Math.round(Math.max(range.min, Math.min(range.max, size)));
}

/**
 * Size of a pane during a drag.
 * @param {number} startSize - Size when the drag began
 * @param {number} delta - Pointer travel in px along the drag axis
 * @param {{ grows: 1|-1 }} direction - 1 when moving the pointer in the positive
 *   direction enlarges the pane (dock), -1 when it shrinks it (timeline, sheet)
 * @param {SizeRange} range
 * @returns {number}
 */
export function draggedSize(startSize, delta, direction, range) {
  return clampSize(startSize + delta * direction.grows, range);
}

/**
 * Size change asked for by a key press on a focused splitter.
 * @param {string} key - KeyboardEvent.key
 * @param {PaneName} pane
 * @returns {number} px to add to the pane; 0 when the key does not resize
 */
export function keyDelta(key, pane) {
  if (pane === 'dock') return { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }[key] || 0;
  // The timeline and the sheet sit below their splitter: up makes them taller.
  return { ArrowUp: KEY_STEP, ArrowDown: -KEY_STEP }[key] || 0;
}

/**
 * CSS custom properties for the stored layout; an unset size (0) leaves the
 * stylesheet's default in charge.
 * @param {{ dockWidth?: number, timelineHeight?: number, sheetHeight?: number }} layout
 * @returns {Record<string, string>}
 */
export function layoutVars(layout) {
  const px = (/** @type {number|undefined} */ value) => (value > 0 ? `${Math.round(value)}px` : '');
  return {
    '--editor-dock': px(layout.dockWidth),
    '--editor-timeline': px(layout.timelineHeight),
    '--editor-sheet': px(layout.sheetHeight),
  };
}

/**
 * @param {number} viewportWidth
 * @returns {boolean} Whether the stacked (phone) layout applies
 */
export const isNarrow = (viewportWidth) => viewportWidth < NARROW_BELOW;

/** Ids of the dock's tabs, in order. */
export const DOCK_TABS = ['media', 'inspector', 'transcript', 'director'];

/**
 * The dock tab to show for a stored value.
 * @param {string} stored
 * @returns {string}
 */
export const dockTabOf = (stored) => (DOCK_TABS.includes(stored) ? stored : DOCK_TABS[0]);

/**
 * Narrow layout: what a tap on the bottom tab bar does. A tab opens the
 * sheet on its panel; tapping the tab that is showing closes the sheet,
 * giving the screen back to the preview and the timeline.
 * @param {{ dockTab: string, sheetOpen: boolean }} layout
 * @param {string} tapped - Tab id
 * @returns {{ dockTab: string, sheetOpen: boolean }}
 */
export function sheetAfterTap(layout, tapped) {
  const showing = layout.sheetOpen && dockTabOf(layout.dockTab) === tapped;
  return { dockTab: tapped, sheetOpen: !showing };
}
