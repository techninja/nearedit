/**
 * View commands: zoom, the editing-mode toggles, and requests that only
 * the UI can serve (opening the shortcuts list).
 * @module utils/commands/viewCommands
 */

import { toggleMode } from '#utils/editor/view.js';
import { zoomBy, zoomToFit } from '#utils/timeline/scroll.js';
import { ZOOM_STEP } from '#utils/timeline/viewport.js';

export { zoomToFit };

/** Zoom in one step. */
export const zoomIn = () => zoomBy(ZOOM_STEP);

/** Zoom out one step. */
export const zoomOut = () => zoomBy(1 / ZOOM_STEP);

/** Snap dragged edges to clip edges, the playhead and markers. */
export const toggleSnapping = () => toggleMode('snapping');

/** Edits shift the clips after them. */
export const toggleRipple = () => toggleMode('ripple');

/** Overlapping clips cross-fade instead of overwriting. */
export const toggleAutoCrossfade = () => toggleMode('autoCrossfade');

/** @type {Set<(request: string) => void>} */
const listeners = new Set();

/**
 * Ask the UI for something a plain function cannot do itself.
 * @param {'shortcuts'} request
 */
export function requestUi(request) {
  for (const listener of listeners) listener(request);
}

/**
 * Serve UI requests (the timeline panel opens the shortcuts list).
 * @param {(request: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onUiRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Open the keyboard shortcuts list. */
export const showShortcuts = () => requestUi('shortcuts');
