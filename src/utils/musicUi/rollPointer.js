/**
 * The pointer on the piano roll (`<music-piano-roll>`): a click on empty
 * space adds a note, a drag there selects with a box; a press on a note
 * selects it and a drag moves it (with every other selected note), by grid
 * steps and semitones; a drag on a note's end makes it longer or shorter;
 * a double click removes it. While a drag is under way the song follows
 * live; it is one undo step when the pointer comes up.
 * @module utils/musicUi/rollPointer
 */

import { dispatch } from 'hybrids';
import * as edit from './noteEdit.js';
import { capturePointer } from './pointerCapture.js';
import { BEAT, ROW, cellAt, cellStart, pitchFit } from './rollModel.js';

/** @typedef {import('./rollEvents.js').PianoRollHost & HTMLElement} Host */

/** Pixels a pointer may travel before a press is a drag. */
const SLOP = 4;
/** Shortest a note can be dragged to, beats. */
const SHORTEST = 0.0625;
/** The selection box while none is being dragged. */
export const NO_BOX = Object.freeze({ x0: 0, y0: 0, x1: 0, y1: 0 });

/**
 * @type {WeakMap<HTMLElement, { kind: 'move'|'resize'|'box', x: number, y: number, base: number[][],
 *   keys: string[], key: string, moved: boolean, last: import('./noteEdit.js').NoteChange|null }>}
 */
const gestures = new WeakMap();

/** @param {Host} host @param {string} type @param {Record<string, any>} detail */
export const send = (host, type, detail) => dispatch(host, type, { detail, bubbles: true });

/** @param {Host} host @returns {number} Beats of the part's loop */
export const loopOf = (host) => host.shown.bars * host.song.beatsPerBar;

/** @param {Host} host @returns {number} Beats a new note is long */
export const newLength = (host) => host.length || Math.max(host.grid, 0.25);

/**
 * @param {PointerEvent|MouseEvent} event - On the note area
 * @returns {{ x: number, y: number }} Pixels from the area's top left
 */
function point(event) {
  const rect = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** @param {Host} host @param {number[]|undefined} note Let a note be heard */
export function hear(host, note) {
  if (note) send(host, 'music-hear', { pitch: note[2], velocity: note[3], length: note[1] });
}

/** @param {Host} host @param {PointerEvent} event */
export function handleDown(host, event) {
  if (event.button !== 0) return;
  const area = /** @type {HTMLElement} */ (event.currentTarget);
  const target = /** @type {HTMLElement} */ (event.target);
  const key = /** @type {HTMLElement|null} */ (target.closest('[data-key]'))?.dataset.key || '';
  const { selected, shown: part } = host;
  capturePointer(area, event);
  let keys = event.shiftKey ? selected : [];
  if (key && event.shiftKey) {
    keys = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  } else if (key) keys = selected.includes(key) ? selected : [key];
  if (keys !== selected) send(host, 'music-select', { keys });
  const grip = target.classList.contains('music-piano-roll-grip');
  const kind = !key ? 'box' : grip ? 'resize' : 'move';
  gestures.set(host, {
    kind,
    ...point(event),
    base: part.notes,
    keys,
    key,
    moved: false,
    last: null,
  });
}

/** @param {Host} host @param {PointerEvent} event */
export function handleMove(host, event) {
  const gesture = gestures.get(host);
  if (!gesture) return;
  const { x, y } = point(event);
  const [dx, dy] = [x - gesture.x, y - gesture.y];
  if (!gesture.moved && Math.hypot(dx, dy) < SLOP) return;
  gesture.moved = true;
  const loop = loopOf(host);
  if (gesture.kind === 'box') {
    const from = cellAt(gesture.x, gesture.y, loop);
    const to = cellAt(x, y, loop);
    const box = { beat0: from.beat, beat1: to.beat, pitch0: from.pitch, pitch1: to.pitch };
    host.box = { x0: gesture.x, y0: gesture.y, x1: x, y1: y };
    const keys = [...new Set([...gesture.keys, ...edit.notesInBox(gesture.base, box)])];
    return void send(host, 'music-select', { keys });
  }
  if (host.locked) return;
  const beats = edit.snapTo(dx / BEAT, host.grid);
  gesture.last =
    gesture.kind === 'resize'
      ? edit.resizeNotes(gesture.base, gesture.keys, beats, host.grid || SHORTEST, loop)
      : edit.moveNotes(
          ...[gesture.base, gesture.keys, beats, -Math.round(dy / ROW), loop],
          pitchFit(host.song, host.snapScale),
        );
  send(host, 'music-notes', { ...gesture.last, phase: 'live' });
}

/** The press was taken away (a scroll began): nothing of it stays. @param {Host} host */
export function handleCancel(host) {
  const gesture = gestures.get(host);
  gestures.delete(host);
  host.box = NO_BOX;
  if (gesture?.last) send(host, 'music-notes', { ...gesture.last, phase: 'cancel' });
}

/** @param {Host} host */
export function handleUp(host) {
  const gesture = gestures.get(host);
  if (!gesture) return;
  gestures.delete(host);
  host.box = NO_BOX;
  const loop = loopOf(host);
  if (gesture.last) {
    send(host, 'music-notes', { ...gesture.last, phase: 'commit' });
    const [first] = gesture.last.notes.filter((n) => gesture.last.keys.includes(edit.noteKey(n)));
    if (gesture.kind === 'resize' && first) host.length = first[1];
    return void hear(host, first);
  }
  if (gesture.moved) return;
  if (gesture.key)
    return void hear(
      host,
      host.shown.notes.find((n) => edit.noteKey(n) === gesture.key),
    );
  if (host.locked) return;
  const cell = cellAt(gesture.x, gesture.y, loop);
  const beat = cellStart(cell.beat, host.grid);
  const pitch = pitchFit(host.song, host.snapScale)(cell.pitch);
  const added = edit.addNote(host.shown.notes, { beat, pitch, length: newLength(host) }, loop);
  host.cursor = { beat, pitch };
  send(host, 'music-notes', { ...added, phase: 'commit' });
  hear(
    host,
    added.notes.find((n) => added.keys.includes(edit.noteKey(n))),
  );
}
