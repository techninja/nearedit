/**
 * Behaviour of one card of the effect stack (`<effect-card>`): its buttons
 * and the reorder grip, which works by dragging (pointer or touch) and
 * with the arrow keys. Everything leaves the card as bubbling events:
 * `effect-action` with `{ action, effectId, toIndex? }` for a change to the
 * stack, `effect-drag` with `{ gap }` while a drag shows where it would
 * drop (`gap: -1` when it ends).
 * @module utils/inspector/effectCardEvents
 */

import { dispatch } from 'hybrids';
import { gapAt, indexAfterDrop, indexAfterKey } from './reorder.js';

/**
 * @typedef {Object} EffectCardHost
 * @property {any} effect - As stored: `{ effectId, type, enabled, params }`
 * @property {Record<string, any>} values - Its parameters at the playhead
 *   (keyframes applied)
 * @property {import('./paramFields.js').ParamContext} context
 * @property {number} index - Position in the stack
 * @property {number} count - Effects in the stack
 * @property {boolean} collapsed
 */

/** @typedef {EffectCardHost & HTMLElement} Host */

/** Pixels the pointer must travel before a press on the grip is a drag. */
const DRAG_START = 4;

/** @type {WeakMap<HTMLElement, { y: number, moved: boolean, gap: number }>} */
const drags = new WeakMap();

/**
 * @param {Host} host
 * @param {string} action
 * @param {Record<string, any>} [extra]
 */
function emit(host, action, extra = {}) {
  const detail = { action, effectId: host.effect.effectId, ...extra };
  dispatch(host, 'effect-action', { detail, bubbles: true });
}

/** A header button: `data-action` is what it does. @param {Host} host @param {Event} event */
export function handleButton(host, event) {
  emit(host, /** @type {HTMLElement} */ (event.currentTarget).dataset.action);
}

/** @param {Host} host */
export function handleCollapse(host) {
  host.collapsed = !host.collapsed;
}

/** The cards of the stack this card is in. @param {Host} host @returns {DOMRect[]} */
function siblingRects(host) {
  const cards = [...(host.parentElement?.querySelectorAll(':scope > effect-card') || [])];
  return cards.map((card) => card.getBoundingClientRect());
}

/** @param {Host} host @param {PointerEvent} event */
export function handleGripDown(host, event) {
  if (event.button !== 0 || host.count < 2) return;
  drags.set(host, { y: event.clientY, moved: false, gap: -1 });
  /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
}

/** @param {Host} host @param {PointerEvent} event */
export function handleGripMove(host, event) {
  const drag = drags.get(host);
  if (!drag) return;
  if (!drag.moved && Math.abs(event.clientY - drag.y) < DRAG_START) return;
  drag.moved = true;
  const gap = gapAt(event.clientY, siblingRects(host));
  if (gap === drag.gap) return;
  drag.gap = gap;
  dispatch(host, 'effect-drag', { detail: { gap }, bubbles: true });
}

/** @param {Host} host @param {PointerEvent} event */
export function handleGripUp(host, event) {
  const drag = drags.get(host);
  drags.delete(host);
  if (!drag?.moved) return;
  dispatch(host, 'effect-drag', { detail: { gap: -1 }, bubbles: true });
  const toIndex = indexAfterDrop(host.index, drag.gap);
  if (event.type === 'pointerup' && drag.gap >= 0 && toIndex !== host.index) {
    emit(host, 'move', { toIndex });
  }
}

/**
 * Arrow keys on the grip move the effect; the grip keeps the focus.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleGripKeys(host, event) {
  const toIndex = indexAfterKey(host.index, event.key, host.count);
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (toIndex === null) return;
  emit(host, 'move', { toIndex });
  requestAnimationFrame(() =>
    /** @type {HTMLElement|null} */ (host.querySelector('.effect-card-grip'))?.focus(),
  );
}
