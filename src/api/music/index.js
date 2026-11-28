/**
 * Music clips on the server: a song rendered by the engine
 * (`#utils/music`) in a worker thread into
 * `<folder>/.nearedit/music/<key>.wav`, cached by key.
 * Contract: docs/app-spec/MUSIC.md § Server and command line.
 *
 *   renderMusic({ folder, song, signal?, onProgress? })
 *     → { file, key, duration, cached }
 *   readMusic(folder, key) → the same for a rendering that exists, or null
 *   importMidi(file, { signal? }) → { song, warnings }
 *
 * @module api/music
 */

export { renderMusic } from './cache.js';
export { MIDI_MAX_BYTES, MIDI_TIMEOUT_MS, importMidi } from './midi.js';
export { RENDER_TIMEOUT_MS, aborted, activeMusicRenders, renderSongFile } from './render.js';
export { musicDir, musicFolder, musicPath, readMusic } from './renderings.js';
export { attachMusic, renderMusicOf } from './timeline.js';

/** @typedef {import('./renderings.js').Rendering} Rendering */
