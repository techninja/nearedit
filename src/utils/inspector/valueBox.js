/**
 * Behaviour of the value box atom (`<field-number>`): typing with commit
 * on Enter or blur, arrow-key stepping, and scrubbing by dragging the
 * label. Every change leaves the atom as a bubbling `field-change` event
 * with `{ name, value, phase }` — `live` while stepping or scrubbing,
 * `commit` for the final value, `cancel` when Escape abandons it.
 * @module utils/inspector/valueBox
 */

import { dispatch } from 'hybrids';
import { parseValue, scrubValue, stepValue } from '#utils/inspector/fieldValue.js';

/**
 * @typedef {Object} ValueBoxHost
 * @property {string} name - Field path reported in the event
 * @property {string} label
 * @property {string} caption - Accessible name when the label is just a letter
 * @property {number} value - Stored units
 * @property {boolean} mixed - Several clips disagree: show a dash
 * @property {boolean} disabled
 * @property {boolean} slider - Also show a range slider (needs min and max)
 * @property {import('#utils/inspector/fieldValue.js').FieldSpec} spec
 * @property {string} draft - Text being typed
 * @property {boolean} typing
 */

/** @typedef {ValueBoxHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, { live: number|null, scrub: { x: number, start: number, moved: boolean }|null }>} */
const states = new WeakMap();

/** @param {Host} host */
function stateOf(host) {
  if (!states.has(host)) states.set(host, { live: null, scrub: null });
  return states.get(host);
}

/**
 * @param {Host} host
 * @param {number|undefined} value
 * @param {'live'|'commit'|'cancel'} phase
 */
function emit(host, value, phase) {
  dispatch(host, 'field-change', { detail: { name: host.name, value, phase }, bubbles: true });
}

/** @param {Host} host @returns {number} The value the next step starts from */
const current = (host) => stateOf(host).live ?? (host.mixed ? NaN : host.value);

/** @param {Host} host @param {'commit'|'cancel'} phase */
function endLive(host, phase) {
  const state = stateOf(host);
  if (state.live === null) return;
  const value = state.live;
  state.live = null;
  emit(host, phase === 'commit' ? value : undefined, phase);
}

/** @param {Host} host */
function commitTyped(host) {
  if (!host.typing) return;
  host.typing = false;
  const value = parseValue(host.draft, host.spec);
  if (value !== null && (host.mixed || value !== host.value)) emit(host, value, 'commit');
}

/** @param {Host} host @param {InputEvent} event */
export function handleInput(host, event) {
  host.draft = /** @type {HTMLInputElement} */ (event.target).value;
  host.typing = true;
}

/** @param {Host} host @param {KeyboardEvent} event */
export function handleKeydown(host, event) {
  if (event.key === 'Enter') return commitTyped(host);
  if (event.key === 'Escape') {
    if (host.typing) host.typing = false;
    else endLive(host, 'cancel');
    return;
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const typed = host.typing ? parseValue(host.draft, host.spec) : null;
  host.typing = false;
  const mods = { shift: event.shiftKey, alt: event.altKey };
  const next = stepValue(typed ?? current(host), event.key === 'ArrowUp' ? 1 : -1, host.spec, mods);
  stateOf(host).live = next;
  emit(host, next, 'live');
}

/** @param {Host} host @param {KeyboardEvent} event */
export function handleKeyup(host, event) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') endLive(host, 'commit');
}

/** @param {Host} host */
export function handleBlur(host) {
  commitTyped(host);
  if (!stateOf(host).scrub) endLive(host, 'commit');
}

/** @param {Host} host @param {PointerEvent} event */
export function handleScrubStart(host, event) {
  if (host.disabled || event.button !== 0) return;
  stateOf(host).scrub = { x: event.clientX, start: current(host), moved: false };
  /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
}

/** @param {Host} host @param {PointerEvent} event */
export function handleScrubMove(host, event) {
  const state = stateOf(host);
  if (!state.scrub) return;
  const mods = { shift: event.shiftKey, alt: event.altKey };
  const next = scrubValue(state.scrub.start, event.clientX - state.scrub.x, host.spec, mods);
  if (next === state.live || (!state.scrub.moved && next === state.scrub.start)) return;
  state.scrub.moved = true;
  state.live = next;
  emit(host, next, 'live');
}

/** @param {Host} host @param {PointerEvent} event */
export function handleScrubEnd(host, event) {
  const state = stateOf(host);
  const moved = state.scrub?.moved;
  state.scrub = null;
  if (moved) endLive(host, event.type === 'pointercancel' ? 'cancel' : 'commit');
  else host.querySelector('input')?.select();
}

/** @param {Host} host @param {Event} event */
export function handleSlide(host, event) {
  event.stopPropagation();
  const value = Number(/** @type {HTMLInputElement} */ (event.target).value);
  emit(host, value, event.type === 'input' ? 'live' : 'commit');
}
