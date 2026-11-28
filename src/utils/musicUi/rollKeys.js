/**
 * The keyboard on the piano roll (`<music-piano-roll>`). With notes
 * selected the arrows nudge them — a grid step, a semitone, an octave with
 * Shift — and Shift with ← → changes their length; Delete removes them and
 * Escape lets go of them. With nothing selected the arrows move a cursor
 * and Enter adds a note there (or selects the one that starts there).
 * Comma and full stop go to the note before and after. Holding a key is
 * one undo step: the change is live until the key comes up.
 * @module utils/musicUi/rollKeys
 */

import * as edit from './noteEdit.js';
import { TOP, pitchFit } from './rollModel.js';
import { hear, loopOf, newLength, send } from './rollPointer.js';

/** @typedef {import('./rollEvents.js').PianoRollHost & HTMLElement} Host */

/** @type {WeakSet<HTMLElement>} Rolls with a held key whose change is still live */
const held = new WeakSet();

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/**
 * Report notes changed by a key: live now, one undo step at key up.
 * @param {Host} host
 * @param {import('./noteEdit.js').NoteChange} change
 */
function nudge(host, change) {
  held.add(host);
  send(host, 'music-notes', { ...change, phase: 'live' });
  hear(
    host,
    change.notes.find((note) => change.keys.includes(edit.noteKey(note))),
  );
}

/**
 * Go to the note before or after the one in hand, in time order.
 * @param {Host} host
 * @param {number} by - −1 or 1
 */
function walk(host, by) {
  const { notes } = host.shown;
  if (!notes.length) return;
  const at = notes.findIndex((note) => host.selected.includes(edit.noteKey(note)));
  const from = at < 0 ? (by > 0 ? -1 : 0) : at;
  const note = notes[(from + by + notes.length) % notes.length];
  host.cursor = { beat: note[0], pitch: note[2] };
  send(host, 'music-select', { keys: [edit.noteKey(note)] });
  hear(host, note);
}

/**
 * An arrow key: nudge the selected notes, or move the cursor.
 * @param {Host} host
 * @param {number[]} arrow - `[beats, semitones]` as −1, 0 or 1
 * @param {boolean} shift
 */
function arrowKey(host, [along, up], shift) {
  const { shown: part, song, selected, grid, snapScale, cursor } = host;
  const loop = loopOf(host);
  const step = grid > 0 ? grid : 0.25;
  const semitones = up * (shift ? 12 : 1);
  if (selected.length && !host.locked) {
    const fit = pitchFit(song, snapScale && up !== 0);
    const change =
      along && shift
        ? edit.resizeNotes(part.notes, selected, along * step, step, loop)
        : edit.moveNotes(part.notes, selected, along * step, semitones, loop, fit);
    return nudge(host, change);
  }
  const beat = Math.max(0, Math.min(loop - step, edit.snapTo(cursor.beat + along * step, step)));
  const pitch = Math.max(0, Math.min(TOP, cursor.pitch + semitones));
  host.cursor = { beat, pitch };
  if (up) send(host, 'music-hear', { pitch, velocity: 0.8, length: newLength(host) });
}

/** Enter: select the note that starts at the cursor, or add one there. @param {Host} host */
function enterKey(host) {
  const { shown: part, cursor } = host;
  const key = edit.noteKey([cursor.beat, 0, cursor.pitch]);
  const there = part.notes.find((note) => edit.noteKey(note) === key);
  if (there) {
    send(host, 'music-select', { keys: [key] });
    return hear(host, there);
  }
  if (host.locked) return;
  const note = { beat: cursor.beat, pitch: cursor.pitch, length: newLength(host) };
  const added = edit.addNote(part.notes, note, loopOf(host));
  send(host, 'music-notes', { ...added, phase: 'commit' });
  hear(
    host,
    added.notes.find((each) => added.keys.includes(edit.noteKey(each))),
  );
}

/** @param {Host} host @param {KeyboardEvent} event */
export function handleKeys(host, event) {
  const { shown: part, selected } = host;
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'a') {
    send(host, 'music-select', { keys: part.notes.map(edit.noteKey) });
  } else if (event.ctrlKey || event.metaKey || event.altKey) return;
  else if (key in ARROWS) arrowKey(host, ARROWS[key], event.shiftKey);
  else if (key === 'Enter') enterKey(host);
  else if (key === ',' || key === '.') walk(host, key === ',' ? -1 : 1);
  else if ((key === 'Delete' || key === 'Backspace') && selected.length && !host.locked) {
    send(host, 'music-notes', { ...edit.removeNotes(part.notes, selected), phase: 'commit' });
  } else if (key === 'Escape' && selected.length) send(host, 'music-select', { keys: [] });
  else return;
  event.preventDefault();
  event.stopPropagation();
}

/** A key came up: what it changed live becomes one undo step. @param {Host} host */
export function handleKeyUp(host) {
  if (!held.delete(host)) return;
  send(host, 'music-notes', { notes: host.shown.notes, keys: host.selected, phase: 'commit' });
}
