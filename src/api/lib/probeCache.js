/**
 * Cached ffprobe. Media listings and previews ask for the same facts again
 * and again, so results are kept in memory keyed by path + mtime + size: an
 * edited file is probed again, an untouched one never is. Concurrent callers
 * share one ffprobe per file and the total number of ffprobe processes is
 * bounded, however many requests arrive at once.
 * @module api/lib/probeCache
 */

import { stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { probe } from './ffmpeg.js';
import { createLimiter, createSingleFlight } from './concurrency.js';

/** @typedef {NonNullable<Awaited<ReturnType<typeof probe>>>} ProbeResult */

const MAX_ENTRIES = 20_000;
/** A failed probe is retried after this long (the file may still be copying). */
const FAILURE_TTL_MS = 60_000;
export const PROBE_CONCURRENCY = Math.max(2, Math.min(8, availableParallelism()));

/** @type {Map<string, { key: string, value: ProbeResult|null, at: number }>} */
const cache = new Map();
const limit = createLimiter(PROBE_CONCURRENCY);
const flights = createSingleFlight();
const counters = { hits: 0, probes: 0 };

/**
 * @param {string} filePath
 * @param {string} key
 * @param {ProbeResult|null} value
 */
function remember(filePath, key, value) {
  cache.delete(filePath); // re-insert so the newest entries sit at the end
  cache.set(filePath, { key, value, at: Date.now() });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/**
 * Probe a media file, reusing the cached result while the file is unchanged.
 * @param {string} filePath - Absolute path
 * @param {{ mtimeMs: number, size: number }} [fileStat] - Pass when already known to skip a stat
 * @returns {Promise<ProbeResult|null>} null when the file is missing or unreadable
 */
export async function cachedProbe(filePath, fileStat) {
  const st = fileStat || (await stat(filePath).catch(() => null));
  if (!st) return null;
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = cache.get(filePath);
  if (hit && hit.key === key && (hit.value || Date.now() - hit.at < FAILURE_TTL_MS)) {
    counters.hits++;
    return hit.value;
  }
  return flights(`${filePath}\n${key}`, () =>
    limit(async () => {
      counters.probes++;
      const value = await probe(filePath);
      remember(filePath, key, value);
      return value;
    }),
  );
}

/** @returns {{ hits: number, probes: number, entries: number }} Counters since start (or the last clear). */
export function probeCacheStats() {
  return { ...counters, entries: cache.size };
}

/** Forget everything (tests, or after media was replaced behind the server's back). */
export function clearProbeCache() {
  cache.clear();
  counters.hits = 0;
  counters.probes = 0;
}
