/**
 * MIDI in and out: read a Standard MIDI File, turn it into a song, write a
 * song as one. Isomorphic and pure.
 * @module utils/music/midi
 */

export { MAX_NOTES, parseMidi } from './parse.js';
export { songFromMidi } from './import.js';
export { TICKS, songToMidi } from './export.js';
export {
  DRUM_CHANNEL,
  DRUM_NOTES,
  GM_DRUMS,
  GM_FAMILIES,
  PRESET_PROGRAMS,
  programPreset,
} from './gm.js';
