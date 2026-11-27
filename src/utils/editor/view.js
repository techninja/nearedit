/**
 * View-state helpers — selection, zoom, scroll and editing toggles.
 * Thin wrappers over `ViewState` so components share one vocabulary.
 * The playhead and cursor belong to the transport (`#utils/playback/transport.js`).
 * @module utils/editor/view
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { expandSelection } from '#utils/edl/selection.js';
import { getDoc } from '#utils/editor/session.js';

/** 0.2 px per second: an hour fits in 720 px. */
export const MIN_ZOOM = 0.002;
export const MAX_ZOOM = 40;
/** Pixels per second at zoom 1. */
export const PX_PER_SECOND = 100;

/** @returns {import('#store/ViewState.js').ViewStateShape} */
export const getView = () => store.get(ViewState);

/**
 * Patch view state.
 * @param {Partial<import('#store/ViewState.js').ViewStateShape>} patch
 */
export function setView(patch) {
  store
    .set(ViewState, patch)
    .catch((err) => console.error('[view] could not update view state:', err));
}

/** @returns {string[]} Selected clip ids */
export const getSelection = () => [...(getView().selection || [])];

/**
 * Replace the selection. Linked and grouped partners are included so that
 * picture and sound are selected together.
 * @param {string[]} clipIds
 * @param {{ expand?: boolean }} [opts]
 */
export function setSelection(clipIds, opts = {}) {
  const ids = opts.expand === false ? clipIds : expandSelection(getDoc(), clipIds);
  setView({ selection: [...new Set(ids)] });
}

/**
 * Click-select behaviour: plain click replaces, ctrl/shift click toggles.
 * @param {string} clipId
 * @param {{ toggle?: boolean }} [opts]
 */
export function selectClip(clipId, opts = {}) {
  if (!opts.toggle) return setSelection([clipId]);
  const group = expandSelection(getDoc(), [clipId]);
  const current = getSelection();
  const selected = current.includes(clipId);
  const next = selected
    ? current.filter((id) => !group.includes(id))
    : [...current, ...group.filter((id) => !current.includes(id))];
  setView({ selection: next });
}

/** Clear the selection. */
export const clearSelection = () => setView({ selection: [] });

/** Select every clip on unlocked tracks. */
export function selectAll() {
  const ids = getDoc()
    .tracks.filter((t) => !t.locked)
    .flatMap((t) => t.clips.map((c) => c.clipId));
  setView({ selection: ids });
}

/**
 * Zoom, keeping one timeline time fixed at one screen x (zoom to cursor).
 * @param {number} zoom - Requested zoom, clamped to MIN_ZOOM..MAX_ZOOM
 * @param {{ anchorTime?: number, anchorX?: number }} [anchor] - Keep
 *   `anchorTime` (seconds) at `anchorX` (px from the left of the lane area)
 */
export function setZoom(zoom, anchor = {}) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const view = getView();
  const { anchorX = 0 } = anchor;
  const anchorTime = anchor.anchorTime ?? (view.scrollX + anchorX) / (PX_PER_SECOND * view.zoom);
  const scrollX = Math.max(0, anchorTime * PX_PER_SECOND * next - anchorX);
  setView({ zoom: next, scrollX });
}

/**
 * Flip one of the boolean editing modes.
 * @param {'snapping'|'ripple'|'autoCrossfade'|'loopEnabled'} key
 */
export function toggleMode(key) {
  setView({ [key]: !getView()[key] });
}
