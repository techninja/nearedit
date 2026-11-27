/**
 * View commands: zoom, the editing-mode toggles, and requests that only
 * the UI can serve (opening the shortcuts list, asking for a time or a name).
 * @module utils/commands/viewCommands
 */

import { getUserPrefs, setUserPrefs } from '#store/UserPrefs.js';
import { getView, toggleMode } from '#utils/editor/view.js';
import { currentViewport, scrollTo, zoomBy, zoomToFit } from '#utils/timeline/scroll.js';
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

/** One large zoom step: three ordinary ones. */
const LARGE_STEP = ZOOM_STEP ** 3;

/** Zoom in a large step. */
export const zoomInLarge = () => zoomBy(LARGE_STEP);

/** Zoom out a large step. */
export const zoomOutLarge = () => zoomBy(1 / LARGE_STEP);

/** Scroll so that the cursor sits in the middle of the view. */
export function centerOnCursor() {
  const vp = currentViewport();
  scrollTo({ x: getView().cursorPosition * vp.pps - vp.width / 2 });
}

/** Snapping also catches markers and region ends. */
export const toggleSnapMarkers = () => setUserPrefs({ snapMarkers: !getUserPrefs().snapMarkers });

/**
 * Choose what auto ripple carries along.
 * @param {'track'|'marks'|'all'} rippleScope
 */
export const setRippleScope = (rippleScope) => setUserPrefs({ rippleScope });

/** @typedef {'shortcuts'|'goto'|'pasteRepeat'|'renameMarker'|'renameRegion'} UiRequest */

/** @type {Set<(request: UiRequest, detail?: string) => void>} */
const listeners = new Set();

/**
 * Ask the UI for something a plain function cannot do itself: open a
 * dialog, show a field.
 * @param {UiRequest} request
 * @param {string} [detail] - What it is about, e.g. the id of the marker to rename
 */
export function requestUi(request, detail = '') {
  for (const listener of listeners) listener(request, detail);
}

/**
 * Serve UI requests (the timeline's components each take the ones they own).
 * @param {(request: UiRequest, detail?: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onUiRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Open the keyboard shortcuts list. */
export const showShortcuts = () => requestUi('shortcuts');

/** Ctrl+G: ask for a time to go to. */
export const askGoToTime = () => requestUi('goto');

/** Ctrl+B: ask how often and how far apart to paste. */
export const askPasteRepeat = () => requestUi('pasteRepeat');
