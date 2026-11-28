/**
 * Pieces of the parts list's template (`<music-part-list>`): what the open
 * part shows below its row.
 * @module utils/musicUi/partListParts
 */

import { html } from 'hybrids';
import { stripCells } from './barStrip.js';
import { number } from './fieldParts.js';
import * as on from './partListEvents.js';
import '#atoms/music-bar-strip/music-bar-strip.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * @param {string} action
 * @param {string} icon
 * @param {string} title
 * @param {boolean} disabled
 * @param {number} [by]
 * @returns {Template}
 */
const tool = (action, icon, title, disabled, by = 0) =>
  html`<button
    type="button"
    class="icon-btn"
    data-action="${action}"
    data-by="${by}"
    title="${title}"
    aria-label="${title}"
    disabled="${disabled}"
    onclick="${on.handleAction}"
  >
    <app-icon name="${icon}" size="sm"></app-icon>
  </button>`;

/**
 * What the open part shows under its row: its name, its mix, the length
 * of its loop, where it plays, and the buttons that copy, move and remove it.
 * @param {any} song
 * @param {any} part
 * @param {{ locked: boolean, first: boolean, last: boolean }} at
 * @returns {Template}
 */
export function partDetails(song, part, { locked, first, last }) {
  const name = (/** @type {string} */ field) => `part.${part.id}.${field}`;
  const off = { disabled: locked, slider: true };
  return html`<div class="music-part-list-details">
    <label class="field-row">
      <span class="field-label">Name</span>
      <input
        class="field-input"
        type="text"
        maxlength="80"
        aria-label="Name of the part"
        placeholder="Named after its sound"
        value="${part.name}"
        disabled="${locked}"
        onchange="${on.handleName}"
      />
    </label>
    ${number(name('pan'), 'Pan', part.pan, 'pan', off)}
    ${number(name('reverb'), 'Reverb', part.reverb, 'send', off)}
    ${number(name('delay'), 'Delay', part.delay, 'send', off)}
    ${number(name('bars'), 'Loop', part.bars, 'bars', { disabled: locked })}
    <div class="field-row">
      <span class="field-label" title="The bars of the song in which this part plays"
        >Plays in</span
      >
      <music-bar-strip
        cells="${stripCells(song, part)}"
        locked="${locked}"
        onstrip-paint="${on.handleStrip}"
      ></music-bar-strip>
    </div>
    <div class="music-part-list-tools">
      ${tool('move', 'up', 'Move up', locked || first, -1)}
      ${tool('move', 'down', 'Move down', locked || last, 1)}
      ${tool('duplicate', 'duplicate', 'Duplicate this part', locked || song.parts.length >= 16)}
      ${tool('remove', 'trash', 'Delete this part', locked)}
    </div>
  </div>`;
}
