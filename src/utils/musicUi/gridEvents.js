/**
 * Behaviour of the drum grid (`<music-drum-grid>`): a press on a step
 * cycles it (rest, hit, accent, soft) and dragging on paints what the
 * first step became; the arrow keys walk the grid and Enter cycles the
 * step in focus; a lane's name plays its drum. Everything leaves as events
 * for the music editor to turn into edits. (The toolbar: `gridTools.js`.)
 * @module utils/musicUi/gridEvents
 */

import { dispatch } from 'hybrids';
import { laneOf, loopSteps, nextStep } from './drumEdit.js';
import { drumRows, stepAt } from './gridModel.js';
import { capturePointer } from './pointerCapture.js';

/**
 * @typedef {Object} DrumGridHost
 * @property {any} shown - The drum part (`part` is taken: an element has one)
 * @property {number} beats - Beats in a bar of the song
 * @property {number[][]} ranges - Where the part plays, for the playhead
 * @property {boolean} all - Every drum of the kit has a row
 * @property {boolean} locked
 * @property {string} lane - The drum that was touched last
 * @property {number} step - The step that has the keyboard focus
 * @property {string[]} kept - Drums that keep their row although they went silent
 */

/** @typedef {DrumGridHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, { drum: string, char: string, steps: number[] }>} The paint under way */
const painting = new WeakMap();

/** @param {Host} host @param {string} type @param {Record<string, any>} detail */
export const send = (host, type, detail) => dispatch(host, type, { detail, bubbles: true });

/** @param {Host} host @param {string} drum A drum was touched: its row stays and is the lane in hand */
function touch(host, drum) {
  host.lane = drum;
  if (!host.kept.includes(drum)) host.kept = [...host.kept, drum];
}

/**
 * Set steps of a lane and say so.
 * @param {Host} host
 * @param {'live'|'commit'|'cancel'} phase
 */
function report(host, phase) {
  const { drum, char, steps } = painting.get(host);
  send(host, 'music-steps', { drum, steps, char, phase });
}

/** A press on a row of steps: the step cycles; a drag will paint. @param {Host} host @param {PointerEvent} event */
export function handleDown(host, event) {
  const row = /** @type {HTMLElement} */ (event.currentTarget);
  if (host.locked || event.button !== 0) return;
  const drum = row.dataset.drum;
  const lane = laneOf(host.shown, drum);
  const step = stepAt(row.getBoundingClientRect(), event.clientX, lane.length);
  const char = nextStep(lane[step]);
  touch(host, drum);
  host.step = step;
  painting.set(host, { drum, char, steps: [step] });
  // A finger may be starting to scroll: its press counts when it is lifted.
  if (event.pointerType === 'touch') return;
  capturePointer(row, event);
  if (char !== '.') send(host, 'music-hear', { drum, char });
  report(host, 'live');
}

/** Dragging over a row paints what the first step became. @param {Host} host @param {PointerEvent} event */
export function handleMove(host, event) {
  const paint = painting.get(host);
  if (!paint || event.pointerType === 'touch') return;
  const row = /** @type {HTMLElement} */ (event.currentTarget);
  const step = stepAt(row.getBoundingClientRect(), event.clientX, loopSteps(host.shown));
  if (paint.steps.includes(step)) return;
  paint.steps.push(step);
  report(host, 'live');
}

/** The press ends (one undo step), or is taken away by a scroll. @param {Host} host @param {PointerEvent} event */
export function handleUp(host, event) {
  const paint = painting.get(host);
  if (!paint) return;
  const tapped = event.pointerType === 'touch';
  if (event.type === 'pointercancel') {
    if (!tapped) report(host, 'cancel');
  } else {
    if (tapped && paint.char !== '.') send(host, 'music-hear', paint);
    report(host, 'commit');
  }
  painting.delete(host);
}

/** A lane's name: hear its drum. @param {Host} host @param {Event} event */
export function handleName(host, event) {
  const { drum } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  touch(host, drum);
  send(host, 'music-hear', { drum, char: 'x' });
}

/**
 * Keys on the grid: arrows walk it, Enter cycles the step, Delete rests it.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleKeys(host, event) {
  const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-step]');
  const row = /** @type {HTMLElement|null} */ (cell?.closest('[data-drum]'));
  if (!cell || !row || event.ctrlKey || event.metaKey || event.altKey) return;
  const drum = row.dataset.drum;
  const step = Number(/** @type {HTMLElement} */ (cell).dataset.step);
  const { rows } = drumRows(host.shown, { all: host.all, kept: host.kept });
  const at = rows.findIndex((each) => each.name === drum);
  const last = loopSteps(host.shown) - 1;
  const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  const edits = { Enter: nextStep(laneOf(host.shown, drum)[step]), Delete: '.', Backspace: '.' };
  if (event.key in edits && !host.locked) {
    const char = edits[event.key];
    touch(host, drum);
    if (char !== '.') send(host, 'music-hear', { drum, char });
    send(host, 'music-steps', { drum, steps: [step], char, phase: 'commit' });
  } else if (event.key in moves || event.key === 'Home' || event.key === 'End') {
    const [down, along] = moves[event.key] || [0, event.key === 'Home' ? -step : last - step];
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + down))].name;
    host.lane = next;
    host.step = Math.max(0, Math.min(last, step + along));
    const target = host.querySelector(`[data-drum="${next}"] [data-step="${host.step}"]`);
    /** @type {HTMLElement|null} */ (target)?.focus();
  } else return;
  event.preventDefault();
  event.stopPropagation();
}
