/**
 * Behaviour of the piano roll's toolbar and keyboard column
 * (`<music-piano-roll>`): the velocity of the selected notes, removing
 * them, opening the "Write…" form, and playing a key. The pointer on the
 * roll itself is in `rollPointer.js`, its keys in `rollKeys.js`.
 * @module utils/musicUi/rollEvents
 */

import * as edit from './noteEdit.js';
import { firstScroll } from './rollModel.js';
import { loopOf, newLength, send } from './rollPointer.js';

/**
 * @typedef {Object} PianoRollHost
 * @property {any} shown - The synth part (`part` is taken: an element has one)
 * @property {any} song - For its key, scale and beats to a bar
 * @property {number[][]} ranges - Where the part plays, for the playhead
 * @property {string[]} selected - Keys of the selected notes
 * @property {number} grid - Beats between grid lines; 0 = none
 * @property {boolean} snapScale - Pitches settle on the song's scale
 * @property {boolean} writing - The "Write…" form is open
 * @property {boolean} locked
 * @property {{ beat: number, pitch: number }} cursor - Where the keyboard is
 * @property {{ x0: number, y0: number, x1: number, y1: number }} box - The
 *   selection box being dragged, in pixels of the note area (`NO_BOX`: none)
 * @property {number} length - Beats of the note that was resized last; 0 = none yet
 */

/** @typedef {PianoRollHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, string>} The part each roll was last scrolled for */
const scrolled = new WeakMap();

/**
 * @param {PianoRollHost} host
 * @returns {number} Velocity of the selected notes (their mean), 0 … 1; the default without any
 */
export function selectedVelocity({ shown: part, selected }) {
  const chosen = part.notes.filter((note) => selected.includes(edit.noteKey(note)));
  if (!chosen.length) return 0.8;
  return chosen.reduce((sum, note) => sum + note[3], 0) / chosen.length;
}

/** The velocity slider moves (live) or is let go (commit). @param {Host} host @param {Event} event */
export function handleVelocity(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const phase = event.type === 'input' ? 'live' : 'commit';
  const velocity = Number(input.value) / 100;
  const change = edit.setVelocity(host.shown.notes, host.selected, velocity, loopOf(host));
  send(host, 'music-notes', { ...change, phase });
}

/** The bin: remove the selected notes. @param {Host} host */
export function handleDelete(host) {
  const change = edit.removeNotes(host.shown.notes, host.selected);
  send(host, 'music-notes', { ...change, phase: 'commit' });
}

/** "Write…" opens and closes its form. @param {Host} host */
export const handleWrite = (host) => send(host, 'music-view', { writing: !host.writing });

/** A key of the keyboard column plays its note. @param {Host} host @param {CustomEvent} event */
export function handleKey(host, event) {
  const { pitch } = event.detail;
  event.stopPropagation();
  host.cursor = { beat: host.cursor.beat, pitch };
  send(host, 'music-hear', { pitch, velocity: 0.8, length: newLength(host) });
}

/**
 * After a render: when another part is shown, bring its notes into view.
 * @param {Host} host
 */
export function syncScroll(host) {
  const view = /** @type {HTMLElement|null} */ (host.querySelector('.music-piano-roll-scroll'));
  if (!view || !view.clientHeight || scrolled.get(host) === host.shown.id) return;
  scrolled.set(host, host.shown.id);
  view.scrollTop = firstScroll(host.shown.notes, view.clientHeight);
}

/** A double click on a note removes it. @param {Host} host @param {MouseEvent} event */
export function handleDouble(host, event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const key = /** @type {HTMLElement|null} */ (target.closest('[data-key]'))?.dataset.key;
  if (!key || host.locked) return;
  send(host, 'music-notes', { ...edit.removeNotes(host.shown.notes, [key]), phase: 'commit' });
}
