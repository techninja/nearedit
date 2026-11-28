/**
 * Music theory helpers: tools that write notes for the editor and the
 * director. Nothing here is stored in a song or needed to play one.
 * Isomorphic and pure; everything seeded.
 * @module utils/music/theory
 */

export { KEY_NAMES, NOTE_NAMES, noteName, noteNumber, pitchClass } from './names.js';
export { SCALES, inScale, scaleNotes, scaleSteps, snapToScale } from './scales.js';
export { CHORD_QUALITIES, buildChord, chord, chordQuality } from './chords.js';
export { degree, progression, spelling } from './roman.js';
export { voiceLead } from './voicing.js';
export { BASS_STYLES, bassLine } from './bass.js';
export { ARP_MODES, arpeggio, padNotes } from './chordParts.js';
export { melody } from './melody.js';
export { BEATS, drumPart } from './beats.js';
export { seeded } from './random.js';
