/**
 * Pieces of the piano roll's template (`<music-piano-roll>`): the bar on
 * top — grid, snapping to the scale, the velocity of the selection, the
 * bin and "Write…" — and the style that draws the roll's rows and lines.
 * @module utils/musicUi/rollParts
 */

import { html } from 'hybrids';
import { handleToggle } from '#utils/inspector/fieldEvents.js';
import { SCALES } from '#utils/music/theory/scales.js';
import { select } from './fieldParts.js';
import * as on from './rollEvents.js';
import { BEAT, GRIDS, scaleBands } from './rollModel.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** @type {import('./choices.js').Choices} */
const GRID_CHOICES = GRIDS.map(([beats, label]) => [String(beats), String(label)]);

/**
 * The style of the note area: its width, the bands of the scale, and the
 * distances between grid, beat and bar lines.
 * @param {{ key: string, scale: string, beatsPerBar: number }} song
 * @param {number} beats - Of the part's loop
 * @param {number} grid - Beats between grid lines; 0 = none
 * @returns {Record<string, string>}
 */
export function areaStyle(song, beats, grid) {
  return {
    width: `${beats * BEAT}px`,
    '--roll-bands': scaleBands(song),
    '--roll-grid': `${(grid || 1) * BEAT}px`,
    '--roll-beat': `${BEAT}px`,
    '--roll-bar': `${song.beatsPerBar * BEAT}px`,
  };
}

/**
 * The bar above the roll.
 * @param {import('./rollEvents.js').PianoRollHost} host
 * @returns {Template}
 */
export function rollBar(host) {
  const { song, selected, grid, snapScale, writing, locked } = host;
  const none = selected.length === 0 || locked;
  const scale = `${song.key} ${SCALES[song.scale]?.label.toLowerCase() || song.scale}`;
  return html`<div class="music-piano-roll-bar">
    ${select('grid', 'Grid', GRID_CHOICES, String(grid))}
    <label class="switch" title="New and moved notes go to the nearest note of the song's scale">
      <input
        type="checkbox"
        data-name="snapScale"
        checked="${snapScale}"
        onchange="${handleToggle}"
      />
      Snap to ${scale}
    </label>
    <label class="music-piano-roll-velocity" title="Velocity of the selected notes">
      <span>Velocity</span>
      <input
        class="field-range"
        type="range"
        min="1"
        max="100"
        aria-label="Velocity of the selected notes"
        value="${Math.round(on.selectedVelocity(host) * 100)}"
        disabled="${none}"
        oninput="${on.handleVelocity}"
        onchange="${on.handleVelocity}"
      />
    </label>
    <button
      type="button"
      class="icon-btn"
      title="Delete the selected notes"
      aria-label="Delete the selected notes"
      disabled="${none}"
      onclick="${on.handleDelete}"
    >
      <app-icon name="trash" size="sm"></app-icon>
    </button>
    <span class="music-piano-roll-count">
      ${selected.length ? `${selected.length} selected` : `${host.shown.notes.length} notes`}
    </span>
    <button
      type="button"
      class="btn btn-secondary"
      aria-pressed="${writing ? 'true' : 'false'}"
      disabled="${locked}"
      onclick="${on.handleWrite}"
    >
      <app-icon name="wand" size="sm"></app-icon> Write…
    </button>
  </div>`;
}
