/**
 * The bar strip (`<music-bar-strip>`): its cells, and what the pointer and
 * the keys do on it. A press switches a bar and a drag paints on with what
 * the first bar became; the arrow keys walk the bars and Enter switches
 * one. A long song puts several bars in a cell.
 * @module utils/musicUi/barStrip
 */

import { dispatch } from 'hybrids';
import { arrowFocus } from '#utils/ui/focus.js';
import { playBars } from './playStrip.js';

/** @typedef {{ from: number, to: number, on: boolean }} StripCell */

/**
 * @typedef {Object} BarStripHost
 * @property {StripCell[]} cells
 * @property {boolean} locked
 */

/** @typedef {BarStripHost & HTMLElement} Host */

/** Cells a strip has at most. */
const MOST_CELLS = 64;

/** @type {WeakMap<HTMLElement, { on: boolean, bars: number[] }>} The strip being painted */
const painting = new WeakMap();

/**
 * The cells of a part's strip.
 * @param {any} song
 * @param {any} part
 * @returns {StripCell[]} A cell is on when the part plays in any of its bars
 */
export function stripCells(song, part) {
  const bars = playBars(song, part);
  const each = Math.ceil(bars.length / MOST_CELLS);
  const cells = [];
  for (let from = 0; from < bars.length; from += each) {
    const to = Math.min(bars.length, from + each);
    cells.push({ from, to, on: bars.slice(from, to).some(Boolean) });
  }
  return cells;
}

/** @param {Element|null|undefined} cell @returns {number[]} The bars a cell stands for */
function barsOf(cell) {
  const { from, to } = /** @type {HTMLElement} */ (cell).dataset;
  return Array.from({ length: Number(to) - Number(from) }, (_, i) => Number(from) + i);
}

/** @param {Host} host @param {'live'|'commit'|'cancel'} phase */
function report(host, phase) {
  const detail = { ...painting.get(host), phase };
  dispatch(host, 'strip-paint', { detail, bubbles: true });
}

/** A press on a bar switches it; a drag paints on. @param {Host} host @param {PointerEvent} event */
export function handleDown(host, event) {
  const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-from]');
  if (!cell || host.locked || event.button !== 0) return;
  const on = /** @type {HTMLElement} */ (cell).dataset.on !== 'true';
  painting.set(host, { on, bars: barsOf(cell) });
  report(host, 'live');
}

/** @param {Host} host @param {PointerEvent} event */
export function handleMove(host, event) {
  const paint = painting.get(host);
  const under = host.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  const cell = under?.closest('[data-from]');
  if (!paint || !cell || !host.contains(cell)) return;
  const fresh = barsOf(cell).filter((bar) => !paint.bars.includes(bar));
  if (!fresh.length) return;
  paint.bars.push(...fresh);
  report(host, 'live');
}

/** The press ends (one undo step), or is taken away. @param {Host} host @param {PointerEvent} event */
export function handleUp(host, event) {
  if (!painting.has(host)) return;
  report(host, event.type === 'pointercancel' ? 'cancel' : 'commit');
  painting.delete(host);
}

/** Arrows walk the bars, Enter switches one. @param {Host} host @param {KeyboardEvent} event */
export function handleKeys(host, event) {
  const cell = /** @type {HTMLElement|null} */ (
    /** @type {HTMLElement} */ (event.target).closest('[data-from]')
  );
  if (!cell) return;
  const cells = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('[data-from]')]);
  if (arrowFocus(cells, event, { horizontal: true })) return void event.stopPropagation();
  if (event.key !== 'Enter' || host.locked) return;
  event.preventDefault();
  painting.set(host, { on: cell.dataset.on !== 'true', bars: barsOf(cell) });
  report(host, 'commit');
  painting.delete(host);
}
