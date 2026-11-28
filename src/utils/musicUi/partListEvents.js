/**
 * Behaviour of the parts list (`<music-part-list>`): choosing a part,
 * muting and soloing it, adding, copying, removing and reordering parts,
 * and passing on what was painted on a part's strip of bars. Everything
 * leaves as events for the music editor to turn into edits.
 * @module utils/musicUi/partListEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';

/**
 * @typedef {Object} PartListHost
 * @property {any} song
 * @property {string} selected - Id of the part that is open
 * @property {string[]} solo - Ids of the parts heard alone
 * @property {boolean} locked
 */

/** @typedef {PartListHost & HTMLElement} Host */

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

/** The strip of a row was painted: say whose it is. @param {Host} host @param {CustomEvent} event */
export function handleStrip(host, event) {
  event.stopPropagation();
  const detail = { partId: dataOf(event).part, ...event.detail };
  dispatch(host, 'music-play', { detail, bubbles: true });
}
