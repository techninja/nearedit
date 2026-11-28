/**
 * Pieces of the drum grid's toolbar (`<music-drum-grid>`): the tools that
 * work on the lane that was touched last.
 * @module utils/musicUi/gridParts
 */

import { html } from 'hybrids';
import { handleTool } from './gridTools.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** Fill a lane with a hit every so many steps. */
const FILLS = [1, 2, 4, 8];

/**
 * @param {string} action
 * @param {number} by
 * @param {string} title
 * @param {string|Template} content
 * @param {boolean} disabled
 * @returns {Template}
 */
const tool = (action, by, title, content, disabled) =>
  html`<button
    type="button"
    class="icon-btn"
    data-action="${action}"
    data-by="${by}"
    title="${title}"
    aria-label="${title}"
    disabled="${disabled}"
    onclick="${handleTool}"
  >
    ${content}
  </button>`;

/**
 * Clear, shift and fill buttons for one lane.
 * @param {string} label - The drum they work on
 * @param {boolean} locked
 * @returns {Template}
 */
export function laneTools(label, locked) {
  const off = locked || !label;
  const icon = (/** @type {string} */ name) => html`<app-icon name="${name}" size="sm"></app-icon>`;
  return html`<span class="music-drum-grid-tools" role="group" aria-label="${`${label} lane`}">
    <span class="music-drum-grid-lane">${label}</span>
    ${tool('clear', 0, `Clear the ${label} lane`, icon('eraser'), off)}
    ${tool('shift', -1, `Shift ${label} one step earlier`, icon('chevron-left'), off)}
    ${tool('shift', 1, `Shift ${label} one step later`, icon('chevron'), off)}
    <span class="music-drum-grid-every">Every</span>
    ${FILLS.map((every) =>
      tool(
        'fill',
        every,
        every === 1
          ? `Fill ${label}: a hit on every step`
          : `Fill ${label}: a hit every ${every} steps`,
        html`<span class="music-drum-grid-fill">${every}</span>`,
        off,
      ),
    )}
  </span>`;
}
