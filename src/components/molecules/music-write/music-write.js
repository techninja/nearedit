/**
 * "Write…" form of the piano roll — lets the engine's helpers write the
 * open part's notes over a chord progression: a bass line (in a style),
 * held chords, an arpeggio (in an order) or a melody. The progression is
 * one of a few common ones in the song's key, shown with the chords they
 * are there, or typed (`Am F C G`, `i-VI-III-VII`). One chord to a bar;
 * the part's loop becomes as long as the progression. Writing replaces the
 * part's notes; "Roll again" writes other notes for the same choices.
 * Asks with a bubbling `music-write` (`detail: { form }`).
 * @module components/molecules/music-write
 */

import { define, html } from 'hybrids';
import * as on from '#utils/musicUi/writeEvents.js';
import {
  WRITERS,
  chordNames,
  progressionChoices,
  writerOption,
} from '#utils/musicUi/writeNotes.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/musicUi/writeEvents.js').MusicWriteHost} MusicWriteHost */

/** @type {import('hybrids').Component<MusicWriteHost>} */
export default define({
  tag: 'music-write',
  song: { value: /** @type {any} */ ({ key: 'C', scale: 'minor' }) },
  what: 'bass',
  sequence: 'i-VI-III-VII',
  typed: false,
  option: '',
  seed: 1,
  problem: '',
  locked: false,
  render: {
    value: (host) => {
      const { song, what, sequence, typed, seed, problem, locked } = host;
      const choices = progressionChoices(song.key, song.scale);
      const listed = !typed && choices.some((choice) => choice.sequence === sequence);
      const names = chordNames(song.key, song.scale, sequence);
      const writer = WRITERS[what] || WRITERS.bass;
      const chosen = writerOption(host);
      return html`
        <div class="music-write-what seg" role="group" aria-label="What to write">
          ${Object.entries(WRITERS).map(
            ([id, { label }]) =>
              html`<button
                type="button"
                data-what="${id}"
                aria-pressed="${id === what ? 'true' : 'false'}"
                onclick="${on.handleWhat}"
              >
                ${label}
              </button>`,
          )}
        </div>
        <label class="music-write-field">
          <span>Chords</span>
          <select class="field-input" aria-label="Chord progression" onchange="${on.handleChoice}">
            ${choices.map(
              (choice) =>
                html`<option
                  value="${choice.sequence}"
                  selected="${listed && choice.sequence === sequence}"
                >
                  ${choice.names} (${choice.sequence})
                </option>`,
            )}
            <option value="" selected="${!listed}">Typed…</option>
          </select>
        </label>
        ${!listed &&
        html`<label class="music-write-field">
          <span>Typed</span>
          <input
            class="field-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            aria-label="Chords, typed"
            placeholder="Am F C G"
            value="${sequence}"
            oninput="${on.handleTyped}"
            onkeydown="${on.handleKeys}"
          />
        </label>`}
        ${writer.options.length
          ? html`<label class="music-write-field">
              <span>${writer.option}</span>
              <select
                class="field-input"
                aria-label="${writer.option}"
                onchange="${on.handleOption}"
              >
                ${writer.options.map(
                  (option) =>
                    html`<option value="${option}" selected="${option === chosen}">
                      ${option}
                    </option>`,
                )}
              </select>
            </label>`
          : html``}
        <label
          class="music-write-field music-write-seed"
          title="The same seed writes the same notes"
        >
          <span>Seed</span>
          <input
            class="field-input field-num"
            type="number"
            min="1"
            max="9999"
            aria-label="Seed"
            value="${seed}"
            onchange="${on.handleSeed}"
            onkeydown="${on.handleKeys}"
          />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          disabled="${locked}"
          onclick="${on.handleWrite}"
        >
          <app-icon name="wand" size="sm"></app-icon> Write
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          title="Other notes for the same choices"
          disabled="${locked}"
          onclick="${on.handleRoll}"
        >
          <app-icon name="dice" size="sm"></app-icon> Roll again
        </button>
        <p class="music-write-about" role="status">
          ${problem ||
          (names.length
            ? `${names.join(' · ')} — one chord to a bar: the part becomes ${names.length} bars long and its notes are replaced.`
            : 'No chord can be read yet. Write names (Am F C G) or numerals (i-VI-III-VII).')}
        </p>
      `;
    },
    shadow: false,
  },
});
