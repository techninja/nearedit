/**
 * Renderings on disk: `<folder>/.nearedit/music/<key>.wav`, 16-bit PCM,
 * stereo. A complete file under a song's key is the rendering of that song.
 * Reading only — nothing here renders.
 * Contract: MUSIC.md § Server and command line.
 * @module api/music/renderings
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KEY_PATTERN } from '#utils/music/key.js';

/**
 * @typedef {Object} Rendering - What `renderMusic` and `POST /music/render` answer
 * @property {string} file - The WAV
 * @property {string} key
 * @property {number} duration - Seconds: the song and its tail
 * @property {boolean} cached - True when nothing had to be rendered
 */

const HEADER = 44;
/** Bytes of one frame: two channels of 16 bits. */
const FRAME = 4;

/**
 * @param {string} folder - A project folder, or the folder of a document
 * @returns {string} Where its renderings live
 */
export const musicDir = (folder) => join(folder, '.nearedit', 'music');

/**
 * @param {string} folder
 * @param {string} key
 * @returns {string} The file a rendering of that key is, or will be
 * @throws {Error} For something that is not a key (it would be a path)
 */
export function musicPath(folder, key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Not a rendering key: ${key}`);
  return join(musicDir(folder), `${key}.wav`);
}

/**
 * The folder a rendering belongs to — `musicPath` the other way round.
 * @param {string} file
 * @param {string} key
 * @returns {string|null} null when the file is not where a rendering of that key lives
 */
export function musicFolder(file, key) {
  const folder = dirname(dirname(dirname(file)));
  return KEY_PATTERN.test(key) && musicPath(folder, key) === file ? folder : null;
}

/**
 * Seconds of sound in a WAV file as this module's renderer writes them.
 * @param {string} file
 * @returns {number} 0 for a file that is missing, cut short or something else
 */
function wavSeconds(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
  } catch {
    return 0; // not there (or not readable): not a rendering
  }
  try {
    const head = Buffer.alloc(HEADER);
    if (readSync(fd, head, 0, HEADER, 0) < HEADER) return 0;
    const tagged = ['RIFF', 'WAVE', 'data'].every(
      (tag, i) => head.toString('latin1', [0, 8, 36][i], [4, 12, 40][i]) === tag,
    );
    const rate = head.readUInt32LE(24);
    const bytes = head.readUInt32LE(40);
    const whole = tagged && head.readUInt16LE(32) === FRAME && rate > 0 && bytes > 0;
    // A file that says more than it holds was cut short: it is rendered again.
    return whole && fstatSync(fd).size === HEADER + bytes ? bytes / FRAME / rate : 0;
  } finally {
    closeSync(fd);
  }
}

/**
 * The rendering of a key, when it is complete.
 * @param {string} folder
 * @param {string} key
 * @returns {Rendering|null}
 */
export function readMusic(folder, key) {
  const file = musicPath(folder, key);
  const duration = wavSeconds(file);
  return duration > 0 ? { file, key, duration, cached: true } : null;
}
