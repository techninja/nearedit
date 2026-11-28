/**
 * Pressing a key on a voice: a fresh note, or a new one on a voice that
 * still sounds. Isomorphic and pure apart from the voice it is given.
 * @module utils/music/engine/voiceStart
 */

import { seedOf, xorshift } from './math.js';
import { OSC1, OSC2, SUB } from './voiceOscillators.js';

/** @typedef {import('./voice.js').Voice} Voice */

/** What `tuned` and `opened` hold before a voice's first run. */
export const UNSET = -1e9;

/**
 * Start a note on a voice that is free.
 * @param {Voice} voice
 * @param {number} note - MIDI note number
 * @param {number} velocity - 0 … 1
 * @param {number} now - Sample of the song
 * @param {number} off - Sample at which the key is let go
 * @param {number} seed - For this note's noise and unison phases
 * @param {number} from - Pitch to glide from; the note itself for no glide
 */
export function startVoice(voice, note, velocity, now, off, seed, from) {
  const p = voice.patch;
  let random = seedOf(seed, note);
  for (let slot = 0; slot < voice.phase.length; slot++) {
    random = xorshift(random);
    voice.phase[slot] = (random >>> 8) / 16777216;
  }
  // The first layer of each oscillator starts where its wave crosses zero,
  // so a note begins the same way every time; the others start anywhere.
  const crossing = { sine: 0, triangle: 0.25 };
  voice.phase[OSC1] = crossing[p.wave1] ?? 0.5;
  voice.phase[OSC2] = crossing[p.wave2] ?? 0.5;
  voice.phase[SUB] = 0;
  voice.seeds[0] = xorshift(random);
  voice.seeds[1] = xorshift(voice.seeds[0]);
  voice.filter.fill(0);
  voice.amp = 0;
  voice.env = 0;
  voice.gain = 0;
  voice.goal = 0;
  voice.pitch = from;
  voice.tuned = UNSET;
  voice.opened = UNSET;
  voice.active = true;
  voice.ending = false;
  voice.started = now;
  strike(voice, note, velocity, off);
}

/**
 * Press a key on a voice: on a fresh one, or again on one that still sounds
 * (a mono part) — then its envelopes rise from where they are.
 * @param {Voice} voice
 * @param {number} note
 * @param {number} velocity
 * @param {number} off
 * @param {boolean} [legato] - Keep the envelopes running: only the pitch moves
 */
export function strike(voice, note, velocity, off, legato = false) {
  const sense = voice.patch.velocity;
  voice.note = note;
  voice.offAt = off;
  voice.gate = true;
  voice.ending = false;
  if (legato) return;
  voice.level = 1 - sense + sense * velocity * Math.sqrt(velocity);
  voice.ampStage = 0;
  voice.envStage = 0;
}
