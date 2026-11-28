/**
 * What changes slowly in a voice, set once per control tick: the two
 * envelopes, the LFO, glide and vibrato, the filter's cutoff, the gain the
 * next run ramps to. Ticks fall on fixed samples of the song, so a voice
 * sounds the same however the song is cut into chunks. Isomorphic and pure.
 * @module utils/music/engine/voiceControl
 */

import { cutoffCoefficient } from './filter.js';
import { noteHz, pow2, sinOf } from './math.js';
import { TICK } from './synthPatch.js';
import { UNSET } from './voiceStart.js';

/** @typedef {import('./voice.js').Voice} Voice */

/** Below this a released voice is over (−60 dB); its last tick fades to nothing. */
const SILENT = 1e-3;
/** An envelope this near to nothing is nothing: tiny numbers are slow numbers. */
const TINY = 1e-9;
/** A pitch (semitones) or cutoff (octaves) this near to the last one is the same. */
const NEAR = 2e-4;

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
  if (voice.ampStage === 0 && voice.amp >= 1) voice.amp = voice.ampStage = 1;
  if (voice.envStage === 0 && voice.env >= 1) voice.env = voice.envStage = 1;
  // Over: released and died away, or fallen to a sustain of nothing.
  const fading = voice.ampStage === 2 || (voice.ampStage === 1 && p.ampEnv.sustain === 0);
  if (fading && voice.amp < SILENT) {
    voice.amp = 0;
    voice.ending = true;
  }

  if (voice.envStage !== 0 && voice.env < TINY) voice.env = 0;

  const age = now - voice.started;
  const swell = p.lfoFade > 0 && age < p.lfoFade ? age / p.lfoFade : 1;
  const wobble = p.lfoUsed ? lfo(p.lfoWave, now * p.lfoInc) * swell : 0;
  voice.pitch += (voice.note - voice.pitch) * (share < 1 ? p.glide * share : p.glide);
  if (voice.pitch - voice.note < NEAR && voice.note - voice.pitch < NEAR) voice.pitch = voice.note;
  const pitch = voice.pitch + p.transpose + p.lfoPitch * wobble;
  const octaves =
    p.envOctaves * voice.env + (p.keyTrack * (pitch - 60)) / 12 + p.lfoFilter * wobble;
  // Powers and tangents are dear: they are worked out again only when the
  // pitch or the cutoff has moved by more than can be heard.
  if (pitch - voice.tuned > NEAR || voice.tuned - pitch > NEAR) {
    voice.tuned = pitch;
    voice.inc = noteHz(pitch) / p.sampleRate;
  }
  // The cutoff glides to where it should be over the run, like the gain,
  // from where the last run was taking it.
  const fresh = voice.opened === UNSET;
  const reached = voice.gGoal;
  if (octaves - voice.opened > NEAR || voice.opened - octaves > NEAR) {
    voice.opened = octaves;
    voice.gGoal = cutoffCoefficient(p.cutoff * pow2(octaves), p.sampleRate);
  }
  voice.g = fresh ? voice.gGoal : reached;
  voice.gStep = (voice.gGoal - voice.g) / span;
  voice.fm = p.fm * voice.env;
  voice.width1 = Math.min(0.95, Math.max(0.05, p.width1 + p.lfoWidth * wobble));
  voice.width2 = Math.min(0.95, Math.max(0.05, p.width2 + p.lfoWidth * wobble));
  voice.gain = voice.goal;
  voice.goal = voice.amp * voice.level * p.gain * (1 - p.lfoAmp * (0.5 - 0.5 * wobble));
  voice.gainStep = (voice.goal - voice.gain) / span;
}
