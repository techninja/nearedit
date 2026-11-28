/**
 * Hearing one thing at once: the drum of a lane when its name or a step is
 * pressed, the note of a key of the piano roll. A hit is a tiny song — one
 * drum hit, or one note, with the part's own sound and mix — rendered by
 * the engine and played once. Hits that were made are kept, so the second
 * press of a drum sounds immediately.
 * @module utils/musicUi/auditionHits
 */

import { auditionHost, holdDevice, releaseDevice, startDevice } from './auditionHost.js';
import { renderSliced, toAudioBuffer } from './auditionRender.js';

/** Hits kept. */
const KEPT = 64;
/** Longest a note is held, beats at 120 BPM (half a second each). */
const LONGEST = 3;

/** @type {Map<string, Promise<AudioBuffer|null>>} */
const made = new Map();

/** @param {any} part @returns {Record<string, any>} What a hit keeps of its part: the mix */
const mixOf = ({ volume, pan, reverb, delay }) => ({ volume, pan, reverb, delay });

/**
 * A song that is one hit of one drum.
 * @param {any} song - For its mix bus
 * @param {any} part - A drum part
 * @param {string} drum
 * @param {string} [char='x'] - How hard: `o`, `x` or `X`
 * @returns {any}
 */
export function drumHit(song, part, drum, char = 'x') {
  const lanes = { [drum]: char === '.' ? 'x' : char };
  const hit = { kind: 'drums', kit: part.kit, steps: 16, bars: 1, lanes, ...mixOf(part) };
  return { bpm: 120, bars: 1, tail: 1.5, master: song.master, parts: [hit] };
}

/**
 * A song that is one note of a synth part.
 * @param {any} song - For its tempo and mix bus
 * @param {any} part - A synth part
 * @param {number} pitch
 * @param {number} [velocity=0.8]
 * @param {number} [length=1] - Beats of the song
 * @returns {any}
 */
export function noteHit(song, part, pitch, velocity = 0.8, length = 1) {
  const held = Math.min(LONGEST, Math.max(0.1, (length * 120) / (song.bpm || 120)));
  const { preset, params, transpose } = part;
  const notes = [[0, held, pitch, velocity]];
  const hit = { kind: 'synth', preset, params, transpose, bars: 1, notes, ...mixOf(part) };
  return { bpm: 120, bars: 1, tail: 2, master: song.master, parts: [hit] };
}

/**
 * @param {any} hit - A hit song
 * @param {any} ctx
 * @returns {Promise<AudioBuffer|null>}
 */
function bufferOf(hit, ctx) {
  const key = JSON.stringify(hit);
  if (!made.has(key)) {
    made.set(
      key,
      renderSliced(hit).then((rendered) => (rendered ? toAudioBuffer(ctx, rendered) : null)),
    );
    if (made.size > KEPT) made.delete(made.keys().next().value);
  }
  return made.get(key);
}

/**
 * Play a hit once. Call from a user gesture.
 * @param {any} hit - `drumHit(…)` or `noteHit(…)`
 * @returns {Promise<boolean>} false when sound could not start
 */
export async function playHit(hit) {
  const host = auditionHost();
  const ctx = host.context();
  const output = host.output();
  if (!ctx || !output) return false;
  const buffer = (await startDevice()) ? await bufferOf(hit, ctx) : null;
  if (!buffer) return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(output);
  holdDevice();
  source.onended = () => {
    source.disconnect();
    releaseDevice();
  };
  source.start();
  return true;
}

/** Forget every hit that was made (another audio context, a test). */
export const forgetHits = () => made.clear();
