/**
 * Behaviour of the "Write…" form (`<music-write>`): what to write, the
 * chord progression — one of the common ones in the song's key, or typed —
 * the writer's own choice, and the seed. "Write" asks the music editor to
 * replace the part's notes; "Roll again" does the same with the next seed.
 * @module utils/musicUi/writeEvents
 */

import { dispatch } from 'hybrids';
import { WRITERS, writerOption } from './writeNotes.js';

/**
 * @typedef {Object} MusicWriteHost
 * @property {any} song - For its key and scale
 * @property {string} what - A key of `WRITERS`
 * @property {string} sequence - The progression: numerals or chord names
 * @property {boolean} typed - The progression is typed, not chosen
 * @property {string} option - The writer's style or order
 * @property {number} seed
 * @property {string} problem - Why nothing could be written
 * @property {boolean} locked
 */

/** @typedef {MusicWriteHost & HTMLElement} Host */

/** @param {Host} host @returns {import('./writeNotes.js').WriteForm} */
export const formOf = (host) => ({
  what: host.what,
  sequence: host.sequence,
  option: writerOption(host),
  seed: host.seed,
});

/** Ask for the notes to be written. @param {Host} host */
export function handleWrite(host) {
  dispatch(host, 'music-write', { detail: { form: formOf(host) }, bubbles: true });
}

/** The next seed, and write. @param {Host} host */
export function handleRoll(host) {
  host.seed = (host.seed % 9999) + 1;
  handleWrite(host);
}

/** What to write was chosen. @param {Host} host @param {Event} event */
export function handleWhat(host, event) {
  const { what } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  if (Object.hasOwn(WRITERS, what)) host.what = what;
}

/** A progression was chosen from the list, or "typed" was. @param {Host} host @param {Event} event */
export function handleChoice(host, event) {
  const { value } = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  host.typed = value === '';
  if (value) host.sequence = value;
  host.problem = '';
}

/** A progression is being typed. @param {Host} host @param {Event} event */
export function handleTyped(host, event) {
  event.stopPropagation();
  host.sequence = /** @type {HTMLInputElement} */ (event.target).value;
  host.problem = '';
}

/** The writer's choice (a bass style, an arpeggio's order). @param {Host} host @param {Event} event */
export function handleOption(host, event) {
  event.stopPropagation();
  host.option = /** @type {HTMLSelectElement} */ (event.target).value;
}

/** The seed was typed. @param {Host} host @param {Event} event */
export function handleSeed(host, event) {
  event.stopPropagation();
  const seed = Math.round(Number(/** @type {HTMLInputElement} */ (event.target).value));
  if (Number.isFinite(seed) && seed > 0) host.seed = Math.min(9999, seed);
}

/** Enter in a box writes. @param {Host} host @param {KeyboardEvent} event */
export function handleKeys(host, event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  handleWrite(host);
}
