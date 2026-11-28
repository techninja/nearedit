/**
 * Behaviour of the parts list (`<music-part-list>`): choosing a part,
 * muting and soloing it, adding, copying, removing and reordering parts,
 * and painting the bars in which a part plays. Everything leaves as
 * events for the music editor to turn into edits.
 * @module utils/musicUi/partListEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';
import { arrowFocus } from '#utils/ui/focus.js';

/**
 * @typedef {Object} PartListHost
 * @property {any} song
 * @property {string} selected - Id of the part that is open
 * @property {string[]} solo - Ids of the parts heard alone
 * @property {boolean} locked
 */

/** @typedef {PartListHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, { partId: string, on: boolean, bars: number[] }>} The strip being painted */
const painting = new WeakMap();

/** @param {Event} event @returns {DOMStringMap} The data of the control and of its row */
function dataOf(event) {
  const control = /** @type {HTMLElement} */ (event.currentTarget);
  const row = /** @type {HTMLElement|null} */ (control.closest('[data-part]'));
  return { ...row?.dataset, ...control.dataset };
}

/** A row's button: select, solo, add, duplicate, remove, move. @param {Host} host @param {Event} event */
export function handleAction(host, event) {
  const { action, part, kind, by } = dataOf(event);
  const detail = { action, partId: part || '', kind, by: Number(by) || 0 };
  dispatch(host, 'music-part', { detail, bubbles: true });
}

/** The mute button of a row. @param {Host} host @param {Event} event */
export function handleMute(host, event) {
  const { part, muted } = dataOf(event);
  emitChange(host, `part.${part}.mute`, muted !== 'true');
}

/** A part's name was typed. @param {Host} host @param {Event} event */
export function handleName(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  emitChange(host, `part.${dataOf(event).part}.name`, input.value);
}

/**
 * The bars a cell of a strip stands for.
 * @param {HTMLElement} cell
 * @returns {number[]}
 */
function barsOf(cell) {
  const [from, to] = [Number(cell.dataset.from), Number(cell.dataset.to)];
  return Array.from({ length: to - from }, (_, i) => from + i);
}

/** @param {Host} host @param {'live'|'commit'} phase */
function report(host, phase) {
  const { partId, on, bars } = painting.get(host);
  dispatch(host, 'music-play', { detail: { partId, bars, on, phase }, bubbles: true });
}

/** A press on a bar of the strip switches it; a drag paints on. @param {Host} host @param {PointerEvent} event */
export function handleStripDown(host, event) {
  const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-from]');
  if (!cell || host.locked || event.button !== 0) return;
  const on = /** @type {HTMLElement} */ (cell).dataset.on !== 'true';
  const bars = barsOf(/** @type {HTMLElement} */ (cell));
  painting.set(host, { partId: dataOf(event).part, on, bars });
  report(host, 'live');
}

/** @param {Host} host @param {PointerEvent} event */
export function handleStripMove(host, event) {
  const paint = painting.get(host);
  const under = host.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  const cell = /** @type {HTMLElement|null} */ (under?.closest('[data-from]'));
  if (!paint || !cell || !(/** @type {HTMLElement} */ (event.currentTarget).contains(cell))) return;
  const fresh = barsOf(cell).filter((bar) => !paint.bars.includes(bar));
  if (!fresh.length) return;
  paint.bars.push(...fresh);
  report(host, 'live');
}

/** @param {Host} host */
export function handleStripUp(host) {
  if (!painting.has(host)) return;
  report(host, 'commit');
  painting.delete(host);
}

/** Keys on the strip: arrows walk its bars, Enter switches one. @param {Host} host @param {KeyboardEvent} event */
export function handleStripKeys(host, event) {
  const strip = /** @type {HTMLElement} */ (event.currentTarget);
  const cell = /** @type {HTMLElement|null} */ (
    /** @type {HTMLElement} */ (event.target).closest('[data-from]')
  );
  if (!cell) return;
  const cells = /** @type {HTMLElement[]} */ ([...strip.querySelectorAll('[data-from]')]);
  if (arrowFocus(cells, event, { horizontal: true })) return void event.stopPropagation();
  if (event.key !== 'Enter' || host.locked) return;
  event.preventDefault();
  const detail = { bars: barsOf(cell), on: cell.dataset.on !== 'true', phase: 'commit' };
  dispatch(host, 'music-play', {
    detail: { partId: dataOf(event).part, ...detail },
    bubbles: true,
  });
}
