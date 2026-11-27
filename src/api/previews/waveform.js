/**
 * Waveform peaks as a background job. The first request for a file starts a
 * `waveform` job and gets "generating"; the client watches the job over the
 * WebSocket (its result carries `path`) and asks again. Peaks are cached in
 * `<dataDir>/previews`, keyed by source path + mtime.
 *
 * Compressed audio is measured from the WAV rendition the audio engine
 * plays, so the drawn waveform lines up with what is heard.
 * @module api/previews/waveform
 */

import { existsSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getConfig } from '../lib/config.js';
import { cacheEntry, produceCacheFile } from '../lib/fileCache.js';
import { HttpError } from '../lib/httpErrors.js';
import { runJob } from '../lib/jobRunner.js';
import { cachedProbe } from '../lib/probeCache.js';
import { ensureWav, needsWav } from '../media/wavRendition.js';
import { computePeaks } from './peaks.js';

const MAX_REMEMBERED_FAILURES = 1000;
/** A failure is answered from memory this long, then generation may be tried again. */
const FAILURE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, import('../lib/jobs.js').Job>} cache file → the job producing it */
const inFlight = new Map();
/** @type {Map<string, { message: string, at: number }>} cache file → why generation failed */
const failures = new Map();

/**
 * @param {string} file
 * @returns {import('../lib/jobs.js').Job|null} The job still working on `file`, if any
 */
function liveJob(file) {
  const job = inFlight.get(file);
  if (job && (job.status === 'queued' || job.status === 'running')) return job;
  inFlight.delete(file); // finished, failed, or cancelled while still queued
  return null;
}

/**
 * @param {string} sourcePath
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @param {import('../lib/fileCache.js').CacheEntry} entry
 * @param {number} duration - Probed duration, an estimate
 * @returns {import('../lib/jobs.js').Job}
 */
function startJob(sourcePath, sourceStat, entry, duration) {
  const label = `Waveform: ${basename(sourcePath)}`;
  return runJob('waveform', { path: sourcePath }, { label }, async ({ job, signal, progress }) => {
    try {
      const audio = needsWav(sourcePath) ? await ensureWav(sourcePath, sourceStat) : sourcePath;
      progress(10, 'Reading audio');
      const data = await computePeaks(audio, {
        duration,
        signal,
        onProgress: (fraction) => progress(10 + fraction * 85),
      });
      await produceCacheFile(entry, (temp) => writeFileSync(temp, JSON.stringify(data)));
      return { path: sourcePath, samples: data.samples, duration: data.duration };
    } catch (err) {
      if (!signal.aborted) {
        failures.set(entry.file, { message: err.message, at: Date.now() });
        if (failures.size > MAX_REMEMBERED_FAILURES) failures.delete(failures.keys().next().value);
      }
      throw err;
    } finally {
      // A cancelled job may already have been replaced by a newer one for this file.
      if (inFlight.get(entry.file) === job) inFlight.delete(entry.file);
    }
  });
}

/**
 * Look up the waveform of a file, starting its generation when needed.
 * Concurrent requests for one file share a single job.
 * @param {string} sourcePath - Absolute, already validated
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @returns {Promise<{ file: string } | { data: object } | { jobId: string }>} `file`: cached
 *   peaks ready to send; `data`: an answer that needs no file (no audio); `jobId`: generating
 * @throws {HttpError} 422 when the file cannot be decoded
 */
export async function requestWaveform(sourcePath, sourceStat) {
  const dir = getConfig().previewsDir;
  const entry = cacheEntry(dir, 'wave', sourcePath, sourceStat, 'peaks.json');
  if (existsSync(entry.file)) return { file: entry.file };
  const running = liveJob(entry.file);
  if (running) return { jobId: running.id };
  const failure = failures.get(entry.file);
  if (failure && Date.now() - failure.at < FAILURE_TTL_MS) {
    const detail = failure.message;
    throw new HttpError(422, 'The waveform of this file could not be generated', { detail });
  }

  const info = await cachedProbe(sourcePath, sourceStat);
  if (!info) throw new HttpError(422, 'This file cannot be read as media');
  if (!info.hasAudio) {
    return { data: { peaks: [], samples: 0, duration: info.duration || 0, peaksPerSecond: 0 } };
  }
  // Another request may have started the job while this one was probing.
  const job = liveJob(entry.file) || startJob(sourcePath, sourceStat, entry, info.duration || 0);
  inFlight.set(entry.file, job);
  return { jobId: job.id };
}
