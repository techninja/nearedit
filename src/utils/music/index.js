/**
 * Music clips, the pure half — everything about a song that needs no file
 * system and no audio hardware: the song and its parts, drum kits and synth
 * presets as data, the engine that turns a song into samples, WAV encoding,
 * the key of a rendering, music theory helpers that write notes, and MIDI
 * in and out. Isomorphic: runs in the browser and in Node, with no DOM, no
 * Web Audio and no Node-only API — and gives the same samples in both.
 * Contract: docs/app-spec/MUSIC.md.
 *
 * Shapes (`Song`, `Part`, `Note`, `Renderer`…) are the JSDoc types of
 * `./types.js`: `import('#utils/music/types.js').Song`.
 * @module utils/music
 */

/**
 * @typedef {import('./types.js').Song} Song
 * @typedef {import('./types.js').Part} Part
 * @typedef {import('./types.js').DrumPart} DrumPart
 * @typedef {import('./types.js').SynthPart} SynthPart
 * @typedef {import('./types.js').Note} Note
 * @typedef {import('./types.js').Renderer} Renderer
 * @typedef {import('./types.js').MusicBlock} MusicBlock
 * @typedef {import('./types.js').Problem} Problem
 */

// The song: bounds, defaults, normalising, checking
export {
  DEFAULT_VELOCITY,
  PART_KINDS,
  SONG_LIMITS,
  STEP_COUNTS,
  defaultMix,
  defaultSong,
} from './limits.js';
export { keyName, normalizeSong } from './normalize.js';
export { drumName } from './normalizeDrums.js';
export { normalizePart, partKind } from './normalizePart.js';
export { cleanNote, cleanNotes } from './notes.js';
export { validateSong } from './validate.js';
export { partLabel, songLabel } from './label.js';

// Drum lanes as strings
export {
  LANE_VELOCITIES,
  fitLane,
  isSilentLane,
  laneFromVelocities,
  laneLength,
  laneVelocities,
} from './lanes.js';

// Timing
export {
  barTimes,
  beatSeconds,
  beatTimes,
  musicSeconds,
  playRanges,
  songFrame,
  songSeconds,
  stepTimes,
  swingBeat,
} from './timing.js';
export { loopEvents, unrollPart } from './unroll.js';

// Catalogs: instruments as data
export { CHOKES, DRUMS, DRUM_NAMES } from './catalog/drums.js';
export { DEFAULT_KIT, KITS } from './catalog/kits.js';
export { DEFAULT_PRESET, PRESETS, PRESET_CATEGORIES } from './catalog/presets.js';
export { FILTER_TYPES, LFO_WAVES, SYNTH_PARAMS, WAVES } from './catalog/synthParams.js';
export { paramValue, partParams, presetParams } from './params.js';

// The engine
export { SAMPLE_RATE, createRenderer, renderSong } from './engine/renderer.js';
export { encodeWav, pcm16, wavHeader } from './wav.js';

// The key of a rendering
export { ENGINE_VERSION, KEY_LENGTH, KEY_PATTERN, canonicalSong, songKey } from './key.js';

// A clip's `music` block
export { isMusicClip, isStaleMusic, musicDuration } from './clip.js';
export { checkMusic, cleanMusic, refitSong } from './field.js';

// Theory helpers that write notes, and MIDI
export * from './theory/index.js';
export * from './midi/index.js';
