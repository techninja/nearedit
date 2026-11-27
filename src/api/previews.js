/**
 * Preview generation — thumbnails and waveform peaks.
 * Waveforms generate in background, notify via WebSocket when ready.
 * @module api/previews
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createJob, updateJob } from './jobs.js';

const exec = promisify(execFile);
export const previewsRouter = Router();

const CACHE_DIR = resolve(process.cwd(), 'data/previews');
mkdirSync(CACHE_DIR, { recursive: true });

/**
 *
 */
function hashKey(str) {
  return createHash('md5').update(str).digest('hex').slice(0, 12);
}

/** @type {Set<string>} actively generating waveforms */
const generating = new Set();

/**
 * GET /api/previews/thumbnail?path=...&cols=10&height=90
 */
previewsRouter.get('/previews/thumbnail', async (req, res) => {
  const src = req.query.path;
  if (!src || !existsSync(src)) return res.status(404).json({ error: 'File not found' });

  const cols = parseInt(req.query.cols) || 10;
  const height = parseInt(req.query.height) || 90;
  const cacheKey = `thumb_${hashKey(src)}_${cols}x${height}.jpg`;
  const cachePath = resolve(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) return res.sendFile(cachePath);

  try {
    const { stdout } = await exec('ffprobe', [
      '-v',
      'quiet',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      src,
    ]);
    const duration = parseFloat(stdout.trim());
    if (!duration || duration <= 0)
      return res.status(422).json({ error: 'Cannot determine duration' });

    await exec(
      'ffmpeg',
      [
        '-i',
        src,
        '-vf',
        `fps=1/${duration / cols},scale=-1:${height},tile=${cols}x1`,
        '-frames:v',
        '1',
        '-q:v',
        '4',
        '-y',
        cachePath,
      ],
      { timeout: 60_000 },
    );

    res.sendFile(cachePath);
  } catch (err) {
    res.status(500).json({ error: 'Thumbnail generation failed', detail: err.message });
  }
});

/**
 * GET /api/previews/waveform?path=...
 * Returns cached waveform immediately, or 202 + starts background generation.
 */
previewsRouter.get('/previews/waveform', async (req, res) => {
  const src = req.query.path;
  if (!src || !existsSync(src)) return res.status(404).json({ error: 'File not found' });

  const key = hashKey(src);

  // Check cache
  const cached = readdirSync(CACHE_DIR).find(
    (f) => f.startsWith(`wave_${key}_`) && f.endsWith('.json'),
  );
  if (cached) {
    return res.json(JSON.parse(readFileSync(resolve(CACHE_DIR, cached), 'utf-8')));
  }

  // Already generating?
  if (generating.has(key)) {
    return res.status(202).json({ status: 'generating', key });
  }

  // Start background generation
  generating.add(key);
  res.status(202).json({ status: 'generating', key });

  generateWaveformBackground(src, key);
});

/**
 * Background waveform generation — creates a job, broadcasts completion.
 */
async function generateWaveformBackground(src, key) {
  const job = createJob('waveform', { path: src, key });

  try {
    updateJob(job.id, { status: 'running', log: ['Probing duration...'], progress: 5 });

    const { stdout } = await exec('ffprobe', [
      '-v',
      'quiet',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      src,
    ]);
    const duration = parseFloat(stdout.trim()) || 0;

    // Adaptive rate: short=100/s, medium=30/s, long=10/s but minimum 50/s for visible detail
    const rate = duration < 30 ? 100 : duration < 300 ? 50 : 30;
    const samples = Math.min(100000, Math.max(200, Math.round(duration * rate)));

    updateJob(job.id, {
      log: [`Generating ${samples} samples (${duration.toFixed(0)}s file)...`],
      progress: 10,
    });

    const peaks = await generatePeaks(src, samples);
    const data = { peaks, samples: peaks.length, duration };
    const cachePath = resolve(CACHE_DIR, `wave_${key}_${samples}.json`);
    writeFileSync(cachePath, JSON.stringify(data));

    updateJob(job.id, {
      status: 'complete',
      result: { key, path: src, samples: peaks.length },
      progress: 100,
      log: ['Ready'],
    });
    console.log(`[Previews] Waveform ready: ${src.split('/').pop()} (${samples} samples)`);
  } catch (err) {
    updateJob(job.id, { status: 'error', error: err.message });
    console.error(`[Previews] Waveform failed: ${err.message}`);
  } finally {
    generating.delete(key);
  }
}

/**
 * Generate peaks from raw PCM.
 * For compressed audio, uses the transcoded WAV to match playback alignment exactly.
 */
async function generatePeaks(src, samples) {
  const rawPath = resolve(CACHE_DIR, `_tmp_${Date.now()}.raw`);

  // For compressed audio, transcode to WAV first (same path as audio engine)
  // This ensures waveform aligns with what the browser actually plays
  const ext = src.split('.').pop().toLowerCase();
  const compressed = ['mp3', 'aac', 'ogg', 'flac', 'm4a'].includes(ext);
  let decodeSrc = src;

  if (compressed) {
    // Check if transcode cache exists, otherwise create it
    const transKey = createHash('md5').update(src).digest('hex').slice(0, 16);
    const wavPath = resolve(process.cwd(), 'data/transcode', `${transKey}.wav`);
    if (!existsSync(wavPath)) {
      mkdirSync(resolve(process.cwd(), 'data/transcode'), { recursive: true });
      await exec(
        'ffmpeg',
        ['-i', src, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-y', wavPath],
        { timeout: 300_000 },
      );
    }
    decodeSrc = wavPath;
  }

  // Extract raw mono PCM from the (possibly transcoded) source
  await exec(
    'ffmpeg',
    ['-i', decodeSrc, '-ac', '1', '-ar', '44100', '-f', 's16le', '-y', rawPath],
    { timeout: 300_000 },
  );

  const buf = readFileSync(rawPath);
  const totalSamples = buf.length / 2;
  const peaks = [];

  // Use floating-point positions to prevent cumulative rounding drift
  for (let i = 0; i < samples; i++) {
    const startSample = Math.floor((i / samples) * totalSamples);
    const endSample = Math.floor(((i + 1) / samples) * totalSamples);
    let max = 0;
    for (let j = startSample; j < endSample && j * 2 + 1 < buf.length; j++) {
      const val = Math.abs(buf.readInt16LE(j * 2));
      if (val > max) max = val;
    }
    peaks.push(max / 32768);
  }

  try {
    unlinkSync(rawPath);
  } catch {}
  return peaks;
}
