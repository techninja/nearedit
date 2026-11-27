/**
 * Keyboard and toolbar of the keyframe strip: Delete removes the selected
 * keys, the arrow keys nudge them a frame at a time (Shift: ten) as one
 * undo step per held key, Escape clears the selection, Ctrl+A selects
 * every key; the toolbar sets an easing or deletes.
 * @module utils/keyframes/stripKeys
 */

import { edit } from '#utils/editor/session.js';
import { finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { clampDelta } from './strip.js';
import { deleteKeys, moveKeys, movedIds, setEase } from './stripEdit.js';
import { rowsOf } from './stripEvents.js';
import { selectedKeys } from './stripSelection.js';

/** @typedef {import('./stripEvents.js').KeyframeStripHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, { keys: import('./strip.js').StripKey[], frames: number }>} */
const nudges = new WeakMap();

/**
 * The keys an action applies to: the selection, or else the focused key.
 * @param {Host} host
 * @param {EventTarget|null} [target]
 * @returns {import('./strip.js').StripKey[]}
 */
function actedOn(host, target) {
  const rows = rowsOf(host);
  const chosen = selectedKeys(rows, host.selected);
  if (chosen.length) return chosen;
  const focused = /** @type {HTMLElement|null} */ (target)?.dataset?.id;
  return focused ? selectedKeys(rows, [focused]) : [];
}

/** @param {Host} host @param {EventTarget|null} [target] */
export function deleteSelected(host, target) {
  const keys = actedOn(host, target);
  if (!keys.length || host.locked) return;
  finishEdit();
  edit((doc) => deleteKeys(doc, host.clip.clipId, keys));
  host.selected = [];
}

/** The toolbar's delete button. @param {Host} host */
export function handleDelete(host) {
  deleteSelected(host);
}

/** The toolbar's easing dropdown. @param {Host} host @param {Event} event */
export function handleEase(host, event) {
  const select = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  const keys = selectedKeys(rowsOf(host), host.selected);
  if (!keys.length || !select.value || host.locked) return;
  finishEdit();
  edit((doc) => setEase(doc, host.clip.clipId, keys, select.value));
}

/** @param {Host} host */
export function handleFit(host) {
  host.fit = host.fit === 'keys' ? 'clip' : 'keys';
}

/** @param {Host} host */
export function handleCollapse(host) {
  host.collapsed = !host.collapsed;
}

/**
 * Move the acted-on keys by whole frames; presses add up until the key is released.
 * @param {Host} host
 * @param {KeyboardEvent} event
 * @param {number} frames
 */
function nudge(host, event, frames) {
  const state = nudges.get(host) || { keys: actedOn(host, event.target), frames: 0 };
  if (!state.keys.length || host.locked) return;
  nudges.set(host, state);
  state.frames += frames;
  const times = state.keys.map((key) => key.time);
  const delta = clampDelta(state.frames / host.fps, { fps: host.fps, times, clip: host.clip });
  state.frames = Math.round(delta * host.fps);
  const { clipId } = host.clip;
  let after = null;
  liveEdit(
    'keyframes:nudge',
    (doc) => {
      after = moveKeys(doc, clipId, state.keys, delta);
      return after;
    },
    host,
  );
  if (after) host.selected = movedIds(after, state.keys, delta);
}

/** @param {Host} host @param {KeyboardEvent} event */
export function handleKeys(host, event) {
  const mod = event.ctrlKey || event.metaKey;
  /** @type {Record<string, () => void>} */
  const actions = {
    Delete: () => deleteSelected(host, event.target),
    Backspace: () => deleteSelected(host, event.target),
    ArrowLeft: () => nudge(host, event, event.shiftKey ? -10 : -1),
    ArrowRight: () => nudge(host, event, event.shiftKey ? 10 : 1),
    Escape: () => void (host.selected = []),
  };
  const selectAll = mod && event.key.toLowerCase() === 'a';
  const action = selectAll
    ? () => void (host.selected = rowsOf(host).flatMap((row) => row.keys.map((key) => key.id)))
    : actions[event.key];
  if (!action || (mod && !selectAll)) return;
  event.preventDefault();
  event.stopPropagation();
  action();
}

/** Releasing an arrow key ends the nudge: one undo step. @param {Host} host @param {KeyboardEvent} event */
export function handleKeyUp(host, event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (nudges.delete(host)) finishEdit();
}
