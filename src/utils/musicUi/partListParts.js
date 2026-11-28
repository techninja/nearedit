/**
 * Pieces of the parts list's template (`<music-part-list>`): the strip of
 * bars a part plays in, and what the open part shows below its row.
 * @module utils/musicUi/partListParts
 */

import { html } from 'hybrids';
import { number } from './fieldParts.js';
import * as on from './partListEvents.js';
import { playBars } from './playStrip.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** Cells a strip has at most; a longer song puts several bars in a cell. */
const MOST_CELLS = 64;

/**
 * The cells of a part's strip.
 * @param {any} song
 * @param {any} part
 * @returns {{ from: number, to: number, on: boolean }[]} A cell is on when
 *   the part plays in any of its bars
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

/**
 * The strip of bars a part plays in: press to switch a bar, drag to paint.
 * @param {any} song
 * @param {any} part
 * @param {boolean} locked
 * @returns {Template}
 */
export function playStrip(song, part, locked) {
  return html`<div
    class="music-part-list-strip"
    role="group"
    aria-label="Bars in which it plays"
    onpointerdown="${on.handleStripDown}"
    onpointermove="${on.handleStripMove}"
    onpointerup="${on.handleStripUp}"
    onpointercancel="${on.handleStripUp}"
    onkeydown="${on.handleStripKeys}"
  >
    ${stripCells(song, part).map(
      ({ from, to, on: plays }, index) =>
        html`<button
          type="button"
          data-from="${from}"
          data-to="${to}"
          data-on="${plays}"
          data-fourth="${from % 4 === 0}"
          tabindex="${index === 0 ? 0 : -1}"
          aria-pressed="${plays ? 'true' : 'false'}"
          aria-label="${to - from > 1 ? `Bars ${from + 1} to ${to}` : `Bar ${from + 1}`}"
          disabled="${locked}"
        ></button>`,
    )}
  </div>`;
}

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
      ${playStrip(song, part, locked)}
    </div>
    <div class="music-part-list-tools">
      ${tool('move', 'up', 'Move up', locked || first, -1)}
      ${tool('move', 'down', 'Move down', locked || last, 1)}
      ${tool('duplicate', 'duplicate', 'Duplicate this part', locked || song.parts.length >= 16)}
      ${tool('remove', 'trash', 'Delete this part', locked)}
    </div>
  </div>`;
}
