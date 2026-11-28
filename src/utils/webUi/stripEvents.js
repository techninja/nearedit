/**
 * Behaviour of the score strip (`<web-score-strip>`): a press selects the
 * step, dragging the end of a block — or the arrow keys on it — changes
 * that block's length in whole frames, and a drag along the ruler scrubs
 * the recording. Events, all bubbling: `web-select` (`{ index }`),
 * `web-retime` (`{ block: { part, index }, frames, phase }`) and
 * `web-seek` (`{ time }`).
 * @module utils/webUi/stripEvents
 */

import { dispatch } from 'hybrids';
import { draggedFrames, keyFrames, timeAtX } from './scoreStrip.js';

/**
 * @typedef {Object} ScoreStripHost
 * @property {{ blocks: import('./scoreStrip.js').StripBlock[], duration: number,
 *   frames: number, fps: number }} strip
 * @property {number} selected - The selected step
 * @property {number} playhead - Seconds of the recording being shown; -1 = none
 * @property {boolean} scrub - The ruler seeks the recording
 * @property {boolean} locked
 * @property {number} frozen - Pixels per second while an end is dragged; 0 = fit the width
 */

/** @typedef {ScoreStripHost & HTMLElement} Host */

/** @type {WeakMap<Host, { key: string, part: string, index: number, startX: number,
 *   startFrames: number, frames: number }>} The end being dragged or keyed */
const held = new WeakMap();

/** @type {(host: Host, name: string, detail: object) => void} */
const send = (host, name, detail) => void dispatch(host, name, { detail, bubbles: true });

/** @type {(event: Event) => { part: any, index: number }} */
function blockOf(event) {
  const target = /** @type {HTMLElement} */ (event.currentTarget);
  const { part, index } = /** @type {HTMLElement} */ (target.closest('[data-part]')).dataset;
  return { part, index: Number(index) };
}

/** @type {(host: Host, block: { part: string, index: number }) => number} */
const framesOf = (host, { part, index }) =>
  host.strip.blocks.find((each) => each.part === part && each.index === index)?.frames ?? 0;

/**
 * @param {Host} host
 * @param {number} frames
 * @param {'live'|'commit'|'cancel'} phase
 */
function retime(host, frames, phase) {
  const now = held.get(host);
  if (!now) return;
  now.frames = frames;
  send(host, 'web-retime', { block: { part: now.part, index: now.index }, frames, phase });
  if (phase === 'live') return;
  held.delete(host);
  host.frozen = 0;
}

/** A block was pressed: select its step. @param {Host} host @param {Event} event */
export function handleSelect(host, event) {
  const { index } = blockOf(event);
  if (index >= 0) send(host, 'web-select', { index });
}

/** The end of a block is taken hold of. @param {Host} host @param {PointerEvent} event */
export function handleGrab(host, event) {
  if (host.locked || event.button > 0) return;
  const handle = /** @type {HTMLElement} */ (event.currentTarget);
  const block = blockOf(event);
  event.preventDefault();
  event.stopPropagation();
  handle.setPointerCapture(event.pointerId);
  handle.focus();
  const { width } = host.querySelector('.web-score-strip-track').getBoundingClientRect();
  const frames = framesOf(host, block);
  held.set(host, { key: '', ...block, startX: event.clientX, startFrames: frames, frames });
  host.frozen = host.strip.duration > 0 ? width / host.strip.duration : 0;
  if (block.index >= 0) send(host, 'web-select', { index: block.index });
}

/** @param {Host} host @param {PointerEvent} event */
export function handleDrag(host, event) {
  const now = held.get(host);
  if (!now || now.key) return;
  const frames = draggedFrames(
    now.startFrames,
    event.clientX - now.startX,
    host.frozen,
    host.strip.fps,
  );
  if (frames !== now.frames) retime(host, frames, 'live');
}

/** @param {Host} host @param {PointerEvent} event */
export function handleRelease(host, event) {
  const now = held.get(host);
  if (!now || now.key) return;
  retime(host, now.frames, event.type === 'pointercancel' ? 'cancel' : 'commit');
}

/**
 * Arrow keys on the end of a block move it by a frame (ten with Shift);
 * the change is one undo step when the key is let go. Escape abandons it.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleKey(host, event) {
  const now = held.get(host);
  if (event.key === 'Escape' && now) {
    event.stopPropagation();
    return retime(host, now.startFrames, 'cancel');
  }
  if (host.locked || (now && !now.key)) return undefined;
  const block = blockOf(event);
  const frames = keyFrames(now ? now.frames : framesOf(host, block), event);
  if (frames === null) return undefined;
  event.preventDefault();
  event.stopPropagation();
  if (!now) held.set(host, { key: event.key, ...block, startX: 0, startFrames: frames, frames });
  return retime(host, frames, 'live');
}

/** The key was let go, or the handle left: the change is final. @param {Host} host */
export function handleKeyEnd(host) {
  const now = held.get(host);
  if (now?.key) retime(host, now.frames, 'commit');
}

/** A press or drag on the ruler goes to that time of the recording. @param {Host} host @param {PointerEvent} event */
export function handleScrub(host, event) {
  if (!host.scrub || (event.type === 'pointermove' && !(event.buttons & 1))) return;
  const ruler = /** @type {HTMLElement} */ (event.currentTarget);
  if (event.type === 'pointerdown') ruler.setPointerCapture(event.pointerId);
  const box = ruler.getBoundingClientRect();
  const { duration, fps } = host.strip;
  send(host, 'web-seek', { time: timeAtX(event.clientX - box.left, box.width, duration, fps) });
}
