/**
 * Song normalisation: turn whatever a document, an editor or a language
 * model holds into a complete song — every default filled in, numbers
 * inside their ranges, lanes as long as their loop, notes in order, unknown
 * fields, parts and parameters gone. It reads only the fields it knows,
 * from plain objects, so its result is bounded JSON-safe data whatever went
 * in. It never throws, never changes its argument, and normalising twice
 * changes nothing more. Isomorphic and pure.
 * @module utils/music/normalize
 */

import * as read from '#utils/web/coerce.js';
import { SONG_LIMITS as LIMITS, defaultSong } from './limits.js';
import { normalizePart } from './normalizePart.js';
import { KEY_NAMES, NOTE_NAMES, pitchClass } from './theory/names.js';
import { SCALES } from './theory/scales.js';
import { songFrame } from './timing.js';

/** @typedef {import('./types.js').Song} Song */
/** @typedef {import('./types.js').Part} Part */

/** Raw parts looked at before giving up on finding more usable ones. */
const SCAN = 10;

/**
 * @param {any} value - A key as written: `c`, `Bb`, `F#`
 * @param {string} fallback
 * @returns {string} One of `KEY_NAMES`
 */
export function keyName(value, fallback) {
  const pitch = pitchClass(value);
  if (pitch < 0) return fallback;
  const text = value.trim();
  const tidy = text[0].toUpperCase() + text.slice(1).replace('♯', '#').replace('♭', 'b');
  return KEY_NAMES.includes(tidy) ? tidy : NOTE_NAMES[pitch];
}

/**
 * Give every part an id no other part has: its own when that is free, else
 * the first free `p1`, `p2`…
 * @param {Part[]} parts - Changed in place
 */
function nameParts(parts) {
  const taken = new Set();
  for (const part of parts) {
    let id = part.id;
    for (let n = 1; id === '' || taken.has(id); n++) id = `p${n}`;
    part.id = id;
    taken.add(id);
  }
}

/**
 * @param {any} raw - `master` as written
 * @returns {Song['master']}
 */
function normalizeMaster(raw) {
  const from = read.record(raw);
  const base = defaultSong().master;
  const reverb = read.record(read.own(from, 'reverb'));
  const delay = read.record(read.own(from, 'delay'));
  return {
    volume: read.numberIn(read.own(from, 'volume'), base.volume, ...LIMITS.volume),
    reverb: {
      size: read.numberIn(read.own(reverb, 'size'), base.reverb.size, 0, 1),
      decay: read.numberIn(read.own(reverb, 'decay'), base.reverb.decay, 0, 1),
    },
    delay: {
      beats: read.numberIn(read.own(delay, 'beats'), base.delay.beats, ...LIMITS.delayBeats),
      feedback: read.numberIn(read.own(delay, 'feedback'), base.delay.feedback, ...LIMITS.feedback),
    },
  };
}

/**
 * Normalise a song.
 * @param {any} raw
 * @returns {Song} Always complete; `{}` gives four empty bars at 120 BPM
 */
export function normalizeSong(raw) {
  const from = read.record(raw);
  const base = defaultSong();
  const frame = songFrame(from);
  const given = read.own(from, 'parts');
  /** @type {Part[]} */
  const parts = [];
  for (const entry of Array.isArray(given) ? given.slice(0, LIMITS.parts * SCAN) : []) {
    const part = parts.length < LIMITS.parts ? normalizePart(entry, frame.beatsPerBar) : null;
    if (part) parts.push(part);
  }
  nameParts(parts);
  return {
    bpm: frame.bpm,
    beatsPerBar: frame.beatsPerBar,
    bars: frame.bars,
    swing: frame.swing,
    key: keyName(read.own(from, 'key'), base.key),
    scale: read.oneOf(read.own(from, 'scale'), Object.keys(SCALES), base.scale),
    tail: frame.tail,
    master: normalizeMaster(read.own(from, 'master')),
    parts,
  };
}
