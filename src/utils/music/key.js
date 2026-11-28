/**
 * The identity of a rendering: a key made from everything that decides what
 * is heard — the song and the engine's version — and from nothing else. The
 * same song is never rendered twice; a changed one has a new key.
 * Isomorphic and pure.
 * @module utils/music/key
 */

import { KEY_LENGTH, canonicalJson } from '#utils/web/key.js';
import { sha256 } from '#utils/web/sha256.js';
import { normalizeSong } from './normalize.js';

export { KEY_LENGTH, KEY_PATTERN } from '#utils/web/key.js';

/**
 * Version of the engine. Raise it when the engine plays the same song
 * differently — a retuned preset, a changed kit, another reverb: every
 * existing rendering then counts as stale.
 */
export const ENGINE_VERSION = 1;

/**
 * The song as the key sees it: normalised, and without what changes nothing
 * in the sound — the names and ids of its parts, and its `key` and `scale`,
 * which are for editors (the engine plays the notes it is given).
 * @param {any} song
 * @returns {Record<string, any>}
 */
export function canonicalSong(song) {
  const { key: _key, scale: _scale, parts, ...heard } = normalizeSong(song);
  return {
    ...heard,
    parts: parts.map(({ id: _id, name: _name, ...part }) => part),
  };
}

/**
 * The key of the rendering a song makes.
 * @param {any} song - Normalised here
 * @param {number|string} [version] - The engine's version, for tests
 * @returns {string} 20 lowercase hex digits: the start of the SHA-256 of
 *   `version \n canonical JSON`
 */
export function songKey(song, version = ENGINE_VERSION) {
  return sha256(`${version}\n${canonicalJson(canonicalSong(song))}`).slice(0, KEY_LENGTH);
}
