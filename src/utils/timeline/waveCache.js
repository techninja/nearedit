/**
 * Waveform cache — the peaks of each source file, fetched once from
 * `GET /api/previews/waveform`. The first request for a file may answer
 * "generating" with a job id; the cache then follows that `waveform` job
 * and asks again when it completes. The timeline redraws as waves arrive.
 * @module utils/timeline/waveCache
 */

import { api, query } from '#utils/api/http.js';
import { waitForJob } from '#utils/api/jobs.js';
import { buildWave } from './peaks.js';

/**
 * @typedef {Object} WaveEntry
 * @property {import('./peaks.js').Wave|null} wave - null until loaded, and for silent files
 * @property {'loading'|'ready'|'error'} state
 */

/** Waves kept in memory. */
const MAX_WAVES = 200;

/** @type {Map<string, WaveEntry>} */
const waves = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Fetch the peaks of one file, waiting for the waveform job when needed.
 * @param {string} path
 * @returns {Promise<import('./peaks.js').Wave|null>} null for a file without sound
 */
async function fetchWave(path) {
  const url = `/previews/waveform${query({ path })}`;
  let data = await api(url);
  if (data?.status === 'generating') {
    await waitForJob(data.jobId);
    data = await api(url);
  }
  if (!Array.isArray(data?.peaks) || !data.peaks.length) return null;
  const rate = data.peaksPerSecond || (data.duration > 0 ? data.peaks.length / data.duration : 0);
  return buildWave(data.peaks, rate);
}

/**
 * The waveform of a source, requesting it when it is not cached yet.
 * @param {string} path - Absolute source path
 * @returns {WaveEntry} Check `state === 'ready'` and `wave` before drawing
 */
export function getWave(path) {
  const known = waves.get(path);
  if (known) return known;
  /** @type {WaveEntry} */
  const entry = { wave: null, state: 'loading' };
  waves.set(path, entry);
  if (waves.size > MAX_WAVES) waves.delete(waves.keys().next().value);
  fetchWave(path).then(
    (wave) => {
      entry.wave = wave;
      entry.state = 'ready';
      for (const listener of listeners) listener();
    },
    (err) => {
      entry.state = 'error';
      console.warn(`[timeline] no waveform for ${path}: ${err.message}`);
    },
  );
  return entry;
}

/**
 * Be told when a waveform has arrived (to redraw).
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onWaveLoaded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
