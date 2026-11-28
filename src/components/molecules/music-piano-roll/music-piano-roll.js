/**
 * Piano roll molecule — the notes of a synth part: pitch rows (the rows of
 * the song's scale are the light ones; the keyboard at the left plays a
 * note), time along the part's loop with the grid. Click adds a note, drag
 * moves it, its end resizes it, a drag on empty space selects, Delete
 * removes; with the keyboard the arrows nudge the selection or move a
 * cursor, and Enter adds. Every note carries its velocity as a bar; the
 * slider on top sets it for the selection. Reports `music-notes`,
 * `music-select`, `music-hear`, `music-view` and (grid, snap) `field-change`.
 * @module components/molecules/music-piano-roll
 */

import { define, html } from 'hybrids';
import { noteKey } from '#utils/musicUi/noteEdit.js';
import * as on from '#utils/musicUi/rollEvents.js';
import { handleKeyUp, handleKeys } from '#utils/musicUi/rollKeys.js';
import * as model from '#utils/musicUi/rollModel.js';
import { areaStyle, rollBar } from '#utils/musicUi/rollParts.js';
import * as pointer from '#utils/musicUi/rollPointer.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/music-keys/music-keys.js';
import '#atoms/music-playhead/music-playhead.js';

/** @typedef {import('#utils/musicUi/rollEvents.js').PianoRollHost} PianoRollHost */

const HELP =
  'Piano roll. Arrow keys move the cursor, Enter adds a note or selects the one there; ' +
  'with notes selected the arrows move them, Shift with left and right changes their length, ' +
  'Delete removes them. Comma and full stop go to the previous and next note.';

/** @type {import('hybrids').Component<PianoRollHost>} */
export default define({
  tag: 'music-piano-roll',
  shown: { value: /** @type {any} */ ({ id: '', bars: 1, notes: [] }) },
  song: { value: /** @type {any} */ ({ key: 'C', scale: 'minor', beatsPerBar: 4 }) },
  ranges: { value: [] },
  selected: { value: [] },
  grid: 0.25,
  snapScale: false,
  writing: false,
  locked: false,
  cursor: { value: { beat: 0, pitch: 60 } },
  box: { value: pointer.NO_BOX },
  length: 0,
  render: {
    value: (host) => {
      const { shown: part, song, selected, cursor, box } = host;
      const beats = part.bars * song.beatsPerBar;
      const cell = Math.max(host.grid || 0.25, 0.0625);
      return html`
        ${rollBar(host)}
        <div class="music-piano-roll-scroll">
          <div class="music-piano-roll-sheet" style="${{ height: `${128 * model.ROW}px` }}">
            <music-keys
              tonic="${song.key}"
              scale="${song.scale}"
              onkey-press="${on.handleKey}"
            ></music-keys>
            <div
              class="music-piano-roll-area"
              tabindex="0"
              role="application"
              aria-label="${HELP}"
              style="${areaStyle(song, beats, host.grid)}"
              onpointerdown="${pointer.handleDown}"
              onpointermove="${pointer.handleMove}"
              onpointerup="${pointer.handleUp}"
              onpointercancel="${pointer.handleCancel}"
              ondblclick="${on.handleDouble}"
              onkeydown="${handleKeys}"
              onkeyup="${handleKeyUp}"
            >
              ${part.notes.map((note) =>
                html`<div
                  class="music-piano-roll-note"
                  data-key="${noteKey(note)}"
                  data-selected="${String(selected.includes(noteKey(note)))}"
                  style="${model.noteBox(note)}"
                >
                  <i style="${{ width: `${Math.round(note[3] * 100)}%` }}"></i>
                  <b class="music-piano-roll-grip"></b>
                </div>`.key(noteKey(note)),
              )}
              <span
                class="music-piano-roll-cursor"
                style="${model.noteBox([cursor.beat, cell, cursor.pitch])}"
              ></span>
              ${box !== pointer.NO_BOX &&
              html`<span
                class="music-piano-roll-box"
                style="${{
                  left: `${Math.min(box.x0, box.x1)}px`,
                  top: `${Math.min(box.y0, box.y1)}px`,
                  width: `${Math.abs(box.x1 - box.x0)}px`,
                  height: `${Math.abs(box.y1 - box.y0)}px`,
                }}"
              ></span>`}
              <music-playhead bars="${part.bars}" ranges="${host.ranges}"></music-playhead>
            </div>
          </div>
        </div>
        <p class="music-piano-roll-hint">
          Click adds a note · drag moves it · drag its end to resize · drag on empty space selects ·
          double-click or Delete removes · arrows nudge (Shift: an octave, or the length)
        </p>
      `;
    },
    shadow: false,
    observe: on.syncScroll,
  },
});
