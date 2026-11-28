/**
 * Behaviour of the Create tab's Music section (`<music-create>`): a tile
 * adds its song, its play button plays or stops it, and a chosen MIDI
 * file is read and added.
 * @module utils/musicUi/createEvents
 */

import { dispatch } from 'hybrids';
import { auditionState, playSong, stopAudition } from './audition.js';
import { readMidiFile } from './midiFiles.js';
import { starterOf, starterSong } from './starters.js';

/**
 * @typedef {Object} MusicCreateHost
 * @property {import('./audition.js').AuditionState} audition
 * @property {string} problem - Why a file could not be imported
 * @property {string[]} warnings - What an imported file could not carry over
 * @property {string} imported - Name of the file that was imported last
 */

/** @typedef {MusicCreateHost & HTMLElement} Host */

/**
 * Ask the Create tab to add a song.
 * @param {Host} host
 * @param {{ song: any, label?: string, open?: boolean }} detail
 */
function add(host, detail) {
  dispatch(host, 'music-add', { detail, bubbles: true });
}

/** A tile was pressed: add its song at the edit cursor. @param {Host} host @param {Event} event */
export function handleAdd(host, event) {
  const { id } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const starter = starterOf(id);
  if (!starter) return;
  stopAudition(`starter:${id}`);
  // An empty song has nothing to hear: it opens in the editor at once.
  add(host, { song: starterSong(id), open: starter.kind === 'empty' });
}

/** A tile's play button: listen to it, or stop. @param {Host} _host @param {Event} event */
export function handlePlay(_host, event) {
  const { id } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const owner = `starter:${id}`;
  const song = starterSong(id);
  const state = auditionState.get();
  if (state.owner === owner && state.playing) stopAudition(owner);
  else if (song) playSong(owner, song, [0, song.bars]);
}

/** A MIDI file was chosen: read it here, add its song, say what was left out. @param {Host} host @param {Event} event */
export async function handleImport(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const [file] = input.files || [];
  if (!file) return;
  const { song, warnings, problem } = await readMidiFile(file);
  input.value = '';
  host.problem = problem;
  host.warnings = warnings;
  host.imported = song ? file.name : '';
  if (song) add(host, { song, label: file.name.replace(/\.midi?$/i, '') });
}
