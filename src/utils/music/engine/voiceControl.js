/**
 * What changes slowly in a voice, set once per control tick: the two
 * envelopes, the LFO, glide and vibrato, the filter's cutoff, the gain the
 * next run ramps to. Ticks fall on fixed samples of the song, so a voice
 * sounds the same however the song is cut into chunks. Isomorphic and pure.
 * @module utils/music/engine/voiceControl
 */

import { cutoffCoefficient } from './filter.js';
import { noteHz, pow2, seedOf, sinOf, xorshift } from './math.js';
import { TICK } from './synthPatch.js';

/** @typedef {import('./voice.js').Voice} Voice */

/** Below this a released voice is over (−80 dB). */
const SILENT = 1e-4;

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
    // The first layer starts where its wave crosses zero; the others anywhere.
    const first = slot === 0 || slot === 7 || slot === 14;
    voice.phase[slot] = first ? (slot === 14 ? 0 : 0.5) : (random >>> 8) / 16777216;
  }
  if (p.wave1 === 'triangle') voice.phase[0] = 0.25;
  if (p.wave1 === 'sine') voice.phase[0] = 0;
  if (p.wave2 === 'triangle') voice.phase[7] = 0.25;
  if (p.wave2 === 'sine') voice.phase[7] = 0;
  voice.seeds[0] = xorshift(random);
  voice.seeds[1] = xorshift(voice.seeds[0]);
  voice.filter.fill(0);
  voice.amp = 0;
  voice.env = 0;
  voice.gain = 0;
  voice.goal = 0;
  voice.pitch = from;
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

/**
 * One envelope, one tick further.
 * @param {number} value
 * @param {number} stage - 0 rising, 1 falling to the sustain, 2 released
 * @param {{ attack: number, decay: number, sustain: number, release: number }} env
 * @param {number} share - How much of a tick this run is
 * @returns {number} The new value; 1 or more means the rise is over
 */
function advance(value, stage, env, share) {
  if (stage === 0) return value + env.attack * share;
  const goal = stage === 1 ? env.sustain : 0;
  const kept = 1 - (1 - (stage === 1 ? env.decay : env.release)) * share;
  return goal + (value - goal) * kept;
}

/**
 * @param {string} wave
 * @param {number} phase - Turns
 * @returns {number} The LFO, −1 … 1
 */
function lfo(wave, phase) {
  const p = phase - Math.floor(phase);
  if (wave === 'triangle') return 1 - 4 * (p < 0.5 ? 0.5 - p : p - 0.5);
  if (wave === 'square') return p < 0.5 ? 1 : -1;
  if (wave === 'saw') return 1 - 2 * p;
  return sinOf(p);
}

/**
 * Set a voice up for its next run.
 * @param {Voice} voice
 * @param {number} now - Sample of the song the run starts at
 * @param {number} span - Samples in the run: a whole tick, or what is left
 *   of one for a voice that starts between ticks
 */
export function control(voice, now, span) {
  const p = voice.patch;
  if (voice.ending) {
    voice.active = false;
    return;
  }
  const share = span / TICK;
  if (voice.gate && voice.offAt <= now) voice.gate = false;
  if (!voice.gate) voice.ampStage = voice.envStage = 2;
  voice.amp = advance(voice.amp, voice.ampStage, p.ampEnv, share);
  voice.env = advance(voice.env, voice.envStage, p.filterEnv, share);
  if (voice.ampStage === 0 && voice.amp >= 1) [voice.amp, voice.ampStage] = [1, 1];
  if (voice.envStage === 0 && voice.env >= 1) [voice.env, voice.envStage] = [1, 1];
  // Over: released and died away, or fallen to a sustain of nothing.
  const fading = voice.ampStage === 2 || (voice.ampStage === 1 && p.ampEnv.sustain === 0);
  if (fading && voice.amp < SILENT) [voice.amp, voice.ending] = [0, true];

  const age = now - voice.started;
  const swell = p.lfoFade > 0 && age < p.lfoFade ? age / p.lfoFade : 1;
  const wobble = lfo(p.lfoWave, now * p.lfoInc) * swell;
  voice.pitch += (voice.note - voice.pitch) * (share < 1 ? p.glide * share : p.glide);
  const pitch = voice.pitch + p.transpose + p.lfoPitch * wobble;
  voice.inc = noteHz(pitch) / p.sampleRate;
  const octaves = p.envOctaves * voice.env + (p.keyTrack * (pitch - 60)) / 12 + p.lfoFilter * wobble;
  voice.g = cutoffCoefficient(p.cutoff * pow2(octaves), p.sampleRate);
  voice.fm = p.fm * voice.env;
  voice.width1 = Math.min(0.95, Math.max(0.05, p.width1 + p.lfoWidth * wobble));
  voice.width2 = Math.min(0.95, Math.max(0.05, p.width2 + p.lfoWidth * wobble));
  voice.gain = voice.goal;
  voice.goal = voice.amp * voice.level * p.gain * (1 - p.lfoAmp * (0.5 - 0.5 * wobble));
  voice.gainStep = (voice.goal - voice.gain) / span;
}
