/**
 * MIDI files in and out, in the browser: a `.mid` chosen with a file input
 * becomes a song (`songFromMidi`, which says what it could not carry
 * over), and a clip's song is saved as one (`songToMidi`).
 * @module utils/musicUi/midiFiles
 */

import { songFromMidi, songToMidi } from '#utils/music/midi/index.js';
import { songLabel } from '#utils/music/label.js';

/** Bytes of the largest file that is read (the server's limit for a MIDI file too). */
export const MIDI_LIMIT = 5 * 1024 * 1024;

/**
 * @param {string} label - What the clip is called
 * @returns {string} A file name for its song
 */
export function midiFileName(label) {
  const safe = String(label || '')
    .replace(/[^\w\- ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return `${safe.slice(0, 60) || 'song'}.mid`;
}

/**
 * Read a MIDI file somebody chose.
 * @param {{ name: string, size: number, arrayBuffer: () => Promise<ArrayBuffer> }} file - A `File`
 * @returns {Promise<{ song: any|null, warnings: string[], problem: string }>}
 *   `song` is null when the file gave no notes, and `problem` says why
 */
export async function readMidiFile(file) {
  const none = (/** @type {string} */ problem) => ({ song: null, warnings: [], problem });
  if (file.size > MIDI_LIMIT) return none(`${file.name} is too large to be a MIDI file`);
  const { song, warnings } = songFromMidi(new Uint8Array(await file.arrayBuffer()));
  if (!song.parts.length) return none(`${file.name}: ${warnings[0] || 'no notes were found'}`);
  return { song, warnings, problem: '' };
}

/**
 * Hand bytes to the person as a download.
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {string} type - MIME type
 */
export function downloadBytes(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([/** @type {any} */ (bytes)], { type }));
  const link = Object.assign(globalThis.document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Save a music clip's song as a MIDI file.
 * @param {any} clip - A music clip
 * @returns {string} The file name
 */
export function exportMidi(clip) {
  const name = midiFileName(clip.label || songLabel(clip.music.song));
  downloadBytes(songToMidi(clip.music.song), name, 'audio/midi');
  return name;
}
