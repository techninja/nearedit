/**
 * Fixtures for the music server tests: a sandbox with one registered
 * project, songs whose sound can be told by measuring, and readers that
 * turn a WAV back into numbers. Not a test file itself.
 * @module tests/music/serverKit
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeMusicRenders, musicDir } from '../../src/api/music/index.js';
import { createSandbox } from '../server/helpers.js';

export { call, serve } from '../server/helpers.js';

export const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Two bars at 120 BPM and a second of tail — five seconds: a kick on the
 * first beat (0 s, gone after half a second), a closed hat at the start of
 * the second bar (2 s, gone after a tenth), and nothing anywhere else.
 */
export const KICK_HAT = {
  bpm: 120,
  bars: 2,
  tail: 1,
  parts: [
    { kind: 'drums', kit: '909', bars: 2, lanes: { kick: `X${'.'.repeat(31)}` } },
    { kind: 'drums', kit: '909', bars: 2, lanes: { hat: `${'.'.repeat(16)}x${'.'.repeat(15)}` } },
  ],
};

/**
 * A song that takes seconds to render: sixteen parts, each an eight-note
 * chord of seven detuned voices a note — about four times faster than it
 * plays on one core.
 * @param {number} [bars=8]
 * @param {number} [bpm=120] - Another tempo is another song, with another key
 * @returns {Record<string, any>}
 */
export function heavy(bars = 8, bpm = 120) {
  const notes = [0, 4, 7, 11, 14, 17, 21, 24].map((step) => [0, 4, 48 + step, 0.8]);
  const part = { kind: 'synth', preset: 'pad', params: { unison: 7 }, bars: 1, notes };
  return { bpm, bars, tail: 1, parts: Array.from({ length: 16 }, () => part) };
}

/**
 * A sandbox whose project is registered as `p1`.
 * @param {string} name
 * @returns {ReturnType<typeof createSandbox> & { music: string }} `music`
 *   is where the project's renderings live
 */
export function musicSandbox(name) {
  const box = createSandbox(name);
  const registry = { p1: { path: box.project, name: 'Songs' } };
  writeFileSync(join(box.data, 'registry.json'), JSON.stringify(registry));
  return { ...box, music: musicDir(box.project) };
}

/**
 * @param {string} folder - A project folder, or a document's
 * @returns {string[]} What is in its music folder besides finished
 *   renderings: partial files, anything else
 */
export function debris(folder) {
  let names;
  try {
    names = readdirSync(musicDir(folder));
  } catch {
    return []; // nothing was ever rendered here
  }
  return names.filter((name) => !/^[0-9a-f]{20}\.wav$/.test(name));
}

/**
 * Wait until no worker thread is rendering.
 * @param {number} [ms=5000]
 * @returns {Promise<boolean>} False when one still was after `ms`
 */
export async function idle(ms = 5000) {
  for (let waited = 0; activeMusicRenders() > 0; waited += 5) {
    if (waited >= ms) return false;
    await sleep(5);
  }
  return true;
}

/**
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<{ result: T, most: number }>} `most`: the most worker
 *   threads seen rendering at once while it ran
 */
export async function watched(work) {
  let most = 0;
  const timer = setInterval(() => (most = Math.max(most, activeMusicRenders())), 1);
  try {
    return { result: await work(), most };
  } finally {
    clearInterval(timer);
  }
}

/**
 * Read a 16-bit stereo WAV.
 * @param {string|Uint8Array} file - A path, or the bytes
 * @returns {{ rate: number, frames: number, left: Float32Array, right: Float32Array }}
 */
export function readWav(file) {
  const bytes = Buffer.from(typeof file === 'string' ? readFileSync(file) : file);
  const frames = bytes.readUInt32LE(40) / 4;
  const [left, right] = [new Float32Array(frames), new Float32Array(frames)];
  for (let i = 0; i < frames; i++) {
    left[i] = bytes.readInt16LE(44 + i * 4) / 32767;
    right[i] = bytes.readInt16LE(46 + i * 4) / 32767;
  }
  return { rate: bytes.readUInt32LE(24), frames, left, right };
}

/**
 * @param {Float32Array} samples
 * @param {number} from - Seconds
 * @param {number} to - Seconds
 * @param {number} [rate=48000]
 * @returns {number} RMS level of that stretch
 */
export function level(samples, from, to, rate = 48000) {
  const [a, b] = [Math.round(from * rate), Math.min(samples.length, Math.round(to * rate))];
  let energy = 0;
  for (let i = a; i < b; i++) energy += samples[i] * samples[i];
  return Math.sqrt(energy / Math.max(1, b - a));
}

/**
 * Roughly how high a stretch sounds: half its zero crossings per second —
 * a kick's falling sine stays near a hundred, a hat's noise is thousands.
 * @param {Float32Array} samples
 * @param {number} from - Seconds
 * @param {number} to - Seconds
 * @param {number} [rate=48000]
 * @returns {number} Hz
 */
export function brightness(samples, from, to, rate = 48000) {
  const [a, b] = [Math.round(from * rate), Math.min(samples.length, Math.round(to * rate))];
  let crossings = 0;
  for (let i = a + 1; i < b; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  return crossings / 2 / (to - from);
}
