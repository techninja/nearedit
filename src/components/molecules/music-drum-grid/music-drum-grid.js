/**
 * Drum grid molecule — the step grid of a drum part: a row for every drum
 * that plays (the silent ones are folded under "more"), a button for every
 * step of the part's loop. A press cycles a step through rest, hit, accent
 * and soft; a drag paints; a row's name plays its drum. The bar on top
 * chooses the kit and the steps to a bar, replaces the lanes with a named
 * beat or adds its fill, and clears, shifts or fills the lane that was
 * touched last. Reports `music-steps`, `music-lane`, `music-beat`,
 * `music-hear`, `music-view` and (kit, steps) `field-change`.
 * @module components/molecules/music-drum-grid
 */

import { define, html } from 'hybrids';
import { DRUMS } from '#utils/music/catalog/drums.js';
import { KIT_CHOICES, STEP_CHOICES } from '#utils/musicUi/choices.js';
import { beatChoices } from '#utils/musicUi/drumBeats.js';
import { select } from '#utils/musicUi/fieldParts.js';
import * as on from '#utils/musicUi/gridEvents.js';
import { drumRows, stepLabel, stepPlace } from '#utils/musicUi/gridModel.js';
import { laneTools } from '#utils/musicUi/gridParts.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/music-playhead/music-playhead.js';

/** @typedef {import('#utils/musicUi/gridEvents.js').DrumGridHost} DrumGridHost */

/**
 * One row: the drum's name, then its steps.
 * @param {DrumGridHost} host
 * @param {import('#utils/musicUi/gridModel.js').DrumRow} row
 * @param {boolean} first - The row that takes the Tab stop when none has it
 */
function drumRow(host, row, first) {
  const { shown: part, beats, lane, step: focused, locked } = host;
  const current = lane ? lane === row.name : first;
  return html`<div class="music-drum-grid-row" role="row" data-current="${current}">
    <button
      type="button"
      class="music-drum-grid-name"
      data-drum="${row.name}"
      title="${`Play the ${row.label.toLowerCase()}`}"
      onclick="${on.handleName}"
    >
      ${row.label}
    </button>
    <div
      class="music-drum-grid-steps"
      data-drum="${row.name}"
      style="${{ '--steps': String(row.lane.length) }}"
      onpointerdown="${on.handleDown}"
      onpointermove="${on.handleMove}"
      onpointerup="${on.handleUp}"
      onpointercancel="${on.handleUp}"
    >
      ${[...row.lane].map(
        (char, step) =>
          html`<button
            type="button"
            role="gridcell"
            class="music-drum-grid-step"
            data-step="${step}"
            data-char="${char}"
            data-place="${stepPlace(step, part.steps, beats)}"
            tabindex="${current && step === Math.min(focused, row.lane.length - 1) ? 0 : -1}"
            aria-label="${stepLabel(row.label, step, part.steps, char)}"
            disabled="${locked}"
          ></button>`,
      )}
    </div>
  </div>`.key(row.name);
}

/** @type {import('hybrids').Component<DrumGridHost>} */
export default define({
  tag: 'music-drum-grid',
  shown: { value: /** @type {any} */ ({ steps: 16, bars: 1, lanes: {} }) },
  beats: 4,
  ranges: { value: [] },
  all: false,
  locked: false,
  lane: '',
  step: 0,
  kept: { value: [] },
  render: {
    value: (host) => {
      const { shown: part, all, kept, locked, lane } = host;
      const { rows, more } = drumRows(part, { all, kept });
      const label = DRUMS.find((drum) => drum.name === (lane || rows[0]?.name))?.label || '';
      return html`
        <div class="music-drum-grid-bar">
          ${select('kit', 'Kit', KIT_CHOICES, part.kit, locked)}
          ${select('steps', 'Steps to a bar', STEP_CHOICES, String(part.steps), locked)}
          <select
            class="field-input"
            aria-label="Replace the pattern with a beat"
            title="Replace the pattern with a named beat"
            disabled="${locked}"
            onchange="${on.handleBeat}"
          >
            <option value="">Beat…</option>
            ${beatChoices().map(
              (beat) =>
                html`<option value="${beat.name}" title="${beat.description}">
                  ${beat.label}
                </option>`,
            )}
          </select>
          <button
            type="button"
            class="btn btn-secondary"
            title="Write the beat's fill into the last bar"
            disabled="${locked}"
            onclick="${on.handleFill}"
          >
            Fill
          </button>
          ${laneTools(label, locked)}
        </div>
        <div class="music-drum-grid-scroll">
          <div
            class="music-drum-grid-rows"
            role="grid"
            aria-label="Drum steps"
            onkeydown="${on.handleKeys}"
          >
            ${rows.map((row, index) => drumRow(host, row, index === 0))}
            <div class="music-drum-grid-head" aria-hidden="true">
              <music-playhead bars="${part.bars}" ranges="${host.ranges}"></music-playhead>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-ghost music-drum-grid-more" onclick="${on.handleMore}">
          ${all ? 'Only the drums that play' : `More drums (${more})`}
        </button>
      `;
    },
    shadow: false,
  },
});
