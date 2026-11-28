/**
 * Behaviour of the steps list (`<web-step-list>`): selecting with a press
 * or the arrow keys, reordering by drag or Alt+arrow, and the buttons of a
 * row. Everything leaves as a bubbling event: `web-select` (`{ index }`),
 * `web-step` (`{ action: 'remove'|'duplicate'|'move', index, to? }`) and
 * `web-step-menu` (`{ x, y }`: where the menu of step kinds belongs).
 * @module utils/webUi/stepListEvents
 */

import { dispatch } from 'hybrids';
import { gapAt, indexAfterDrop, indexAfterKey } from '#utils/inspector/reorder.js';

/**
 * @typedef {Object} StepListHost
 * @property {import('./stepRows.js').StepRow[]} rows
 * @property {number} selected - A row's index; `rows.length` is the end
 * @property {boolean} locked - The clip cannot be edited
 * @property {number} dropGap - Where a dragged row would land; -1 when none is dragged
 * @property {number} dragged - Index of the row being dragged; -1 when none
 */

/** @typedef {StepListHost & HTMLElement} Host */

const DRAG_TYPE = 'application/x-nearedit-web-step';

/** @type {(host: Host, name: string, detail: object) => void} */
const send = (host, name, detail) => void dispatch(host, name, { detail, bubbles: true });

/** @type {(event: Event) => number} The index of the row an event happened in */
const rowOf = (event) => {
  const target = /** @type {HTMLElement} */ (event.currentTarget);
  return Number(/** @type {HTMLElement} */ (target.closest('[data-index]')).dataset.index);
};

/** @param {Host} host @param {Event} event */
export function handleSelect(host, event) {
  send(host, 'web-select', { index: rowOf(event) });
}

/** A button of a row: `data-action` is remove, duplicate, up or down. @param {Host} host @param {Event} event */
export function handleAction(host, event) {
  event.stopPropagation();
  const index = rowOf(event);
  const { action } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  if (action === 'up' || action === 'down')
    send(host, 'web-step', { action: 'move', index, to: index + (action === 'up' ? -1 : 1) });
  else send(host, 'web-step', { action, index });
}

/**
 * Keys on a row: arrows select, Alt+arrows move the step, Delete removes
 * it, Ctrl/Cmd+D copies it.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleKeys(host, event) {
  const index = rowOf(event);
  const step = index < host.rows.length;
  const count = host.rows.length;
  const used = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  if (event.altKey && step && !host.locked) {
    const to = indexAfterKey(index, event.key, count);
    if (to === null) return;
    used();
    refocus(host);
    return send(host, 'web-step', { action: 'move', index, to });
  }
  const to = indexAfterKey(index, event.key, count + 1);
  if (to !== null) {
    used();
    return send(host, 'web-select', { index: to });
  }
  if (!step || host.locked) return;
  const copy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd';
  if (!copy && event.key !== 'Delete' && event.key !== 'Backspace') return;
  used();
  refocus(host);
  send(host, 'web-step', { action: copy ? 'duplicate' : 'remove', index });
}

/** "Add a step": ask for the menu of step kinds, under the button. @param {Host} host @param {Event} event */
export function handleAdd(host, event) {
  const box = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
  send(host, 'web-step-menu', { x: box.left, y: box.bottom });
}

/**
 * After a key moved, copied or removed a step, the focus goes to the row
 * that is selected now (the row it was on may be gone).
 * @param {Host} host
 */
function refocus(host) {
  const again = () =>
    /** @type {HTMLElement|null} */ (host.querySelector('[aria-selected="true"]'))?.focus();
  requestAnimationFrame(() => requestAnimationFrame(again));
}

/** @param {Host} host @param {DragEvent} event */
export function handleDragStart(host, event) {
  host.dragged = rowOf(event);
  event.dataTransfer.setData(DRAG_TYPE, String(host.dragged));
  event.dataTransfer.effectAllowed = 'move';
}

/** @param {Host} host @param {DragEvent} event */
export function handleDragOver(host, event) {
  if (host.dragged < 0) return;
  event.preventDefault();
  const rows = [...host.querySelectorAll('.web-step-list-row[draggable="true"]')];
  host.dropGap = gapAt(
    event.clientY,
    rows.map((row) => row.getBoundingClientRect()),
  );
}

/** @param {Host} host @param {DragEvent} event */
export function handleDrop(host, event) {
  event.preventDefault();
  const from = host.dragged;
  const to = indexAfterDrop(from, host.dropGap);
  handleDragEnd(host);
  if (from >= 0 && to !== from) send(host, 'web-step', { action: 'move', index: from, to });
}

/** @param {Host} host */
export function handleDragEnd(host) {
  host.dragged = -1;
  host.dropGap = -1;
}

/**
 * After the selection moved by keyboard, the focus goes with it — once
 * the rows have been drawn again.
 * @param {Host} host
 */
export function followSelection(host) {
  const active = /** @type {HTMLElement|null} */ (host.ownerDocument.activeElement);
  if (!active || !host.contains(active) || !active.matches('.web-step-list-row')) return;
  requestAnimationFrame(() =>
    /** @type {HTMLElement|null} */ (host.querySelector('[aria-selected="true"]'))?.focus(),
  );
}
