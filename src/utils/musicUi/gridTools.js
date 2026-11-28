/**
 * Behaviour of the drum grid's toolbar (`<music-drum-grid>`): clear, shift
 * or fill the lane that was touched last, replace the pattern with a named
 * beat, add its fill, and fold the silent drums away or bring them out.
 * @module utils/musicUi/gridTools
 */

import { send } from './gridEvents.js';

/** @typedef {import('./gridEvents.js').DrumGridHost & HTMLElement} Host */

/** A button of the lane tools: clear, shift or fill the lane in hand. @param {Host} host @param {Event} event */
export function handleTool(host, event) {
  const { action, by } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  send(host, 'music-lane', { action, drum: host.lane, by: Number(by) || 0 });
}

/** "Beat…": replace the lanes with a named beat. @param {Host} host @param {Event} event */
export function handleBeat(host, event) {
  const menu = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  if (menu.value) send(host, 'music-beat', { action: 'beat', name: menu.value });
  menu.value = '';
}

/** "Fill": the beat's fill in the last bar. @param {Host} host */
export const handleFill = (host) => send(host, 'music-beat', { action: 'fill' });

/** "More drums" / "Fewer": fold the silent drums away or bring them out. @param {Host} host */
export const handleMore = (host) => send(host, 'music-view', { allLanes: !host.all });
