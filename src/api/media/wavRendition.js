/**
 * WAV renditions of compressed audio. Browsers seek inaccurately in VBR
 * files, so the audio engine plays a PCM copy instead, and waveform peaks
 * are computed from that same copy so picture and sound line up.
 *
 * Renditions are cached in `<dataDir>/transcode`, keyed by source path +
 * mtime, and concurrent requests for one file share a single ffmpeg run.
 * @module api/media/wavRendition
 */

import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { createLimiter, createSingleFlight } from '../lib/concurrency.js';
import { getConfig } from '../lib/config.js';
import { run } from '../lib/ffmpeg.js';
import { cacheEntry, produceCacheFile } from '../lib/fileCache.js';

/** Formats the audio engine asks a WAV rendition for (lossless WAV plays as is). */
export const WAV_RENDITION_EXTS = ['.mp3', '.aac', '.ogg', '.flac', '.m4a'];
export const WAV_SAMPLE_RATE = 44100;
const TIMEOUT_MS = 10 * 60 * 1000;

const flights = createSingleFlight();
const limit = createLimiter(2);
const counters = { runs: 0 };

/**
 * @param {string} filePath
 * @returns {boolean} true when the audio engine plays a WAV rendition of this file
 */
export function needsWav(filePath) {
  return WAV_RENDITION_EXTS.includes(extname(filePath).toLowerCase());
}

/**
 * Return the path of the cached WAV rendition, transcoding first if needed.
 * @param {string} sourcePath - Absolute path of an existing audio file
 * @param {{ mtimeMs: number, size: number }} [sourceStat] - Pass when already known
 * @returns {Promise<string>} Absolute path of the WAV file
 */
export async function ensureWav(sourcePath, sourceStat) {
  const st = sourceStat || (await stat(sourcePath));
  const entry = cacheEntry(getConfig().transcodeDir, 'wav', sourcePath, st, 'pcm.wav');
  if (existsSync(entry.file)) return entry.file;
  return flights(entry.file, () =>
    limit(() =>
      produceCacheFile(entry, async (temp) => {
        counters.runs++;
        const input = ['-v', 'error', '-nostdin', '-i', sourcePath, '-map', '0:a:0', '-vn'];
        const output = ['-acodec', 'pcm_s16le', '-ar', String(WAV_SAMPLE_RATE), '-ac', '2'];
        await run('ffmpeg', [...input, ...output, '-f', 'wav', '-y', temp], {
          timeout: TIMEOUT_MS,
        });
      }),
    ),
  );
}

/** @returns {{ runs: number, active: number }} ffmpeg runs since start, and transcodes in flight. */
export function wavRenditionStats() {
  return { runs: counters.runs, active: flights.size() };
}
