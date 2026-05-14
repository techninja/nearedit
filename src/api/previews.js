/**
 * Preview generation — thumbnails and waveform peaks.
 * Accepts absolute file paths via ?path= query param.
 * Caches to disk keyed by content hash of the path.
 * @module api/previews
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
export const previewsRouter = Router();

const CACHE_DIR = resolve(process.cwd(), 'data/previews');
mkdirSync(CACHE_DIR, { recursive: true });

/** Short hash of a string for cache keys */
function hashKey(str) {
  return createHash('md5').update(str).digest('hex').slice(0, 12);
}

/**
 * GET /api/previews/thumbnail?path=/abs/path.mp4&cols=10&height=90
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
      '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', src,
    ]);
    const duration = parseFloat(stdout.trim());
    if (!duration || duration <= 0) return res.status(422).json({ error: 'Cannot determine duration' });
    const interval = duration / cols;

    await exec('ffmpeg', [
      '-i', src,
      '-vf', `fps=1/${interval},scale=-1:${height},tile=${cols}x1`,
      '-frames:v', '1', '-q:v', '4', '-y', cachePath,
    ], { timeout: 60_000 });

    res.sendFile(cachePath);
  } catch (err) {
    res.status(500).json({ error: 'Thumbnail generation failed', detail: err.message });
  }
});

/**
 * GET /api/previews/waveform?path=/abs/path.mp3&samples=800
 */
previewsRouter.get('/previews/waveform', async (req, res) => {
  const src = req.query.path;
  if (!src || !existsSync(src)) return res.status(404).json({ error: 'File not found' });

  const samples = parseInt(req.query.samples) || 800;
  const cacheKey = `wave_${hashKey(src)}_${samples}.json`;
  const cachePath = resolve(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    return res.json(JSON.parse(readFileSync(cachePath, 'utf-8')));
  }

  try {
    const result = await generatePeaks(src, samples);
    const data = { peaks: result, samples: result.length };
    writeFileSync(cachePath, JSON.stringify(data));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Waveform generation failed', detail: err.message });
  }
});

/**
 * Generate peaks from raw PCM extraction.
 * @param {string} src
 * @param {number} samples
 * @returns {Promise<number[]>}
 */
async function generatePeaks(src, samples) {
  const rawPath = resolve(CACHE_DIR, `_tmp_${Date.now()}.raw`);
  await exec('ffmpeg', [
    '-i', src, '-ac', '1', '-ar', '8000', '-f', 's16le', '-y', rawPath,
  ], { timeout: 120_000 });

  const buf = readFileSync(rawPath);
  const totalSamples = buf.length / 2;
  const chunkSize = Math.max(1, Math.floor(totalSamples / samples));
  const peaks = [];

  for (let i = 0; i < samples; i++) {
    let max = 0;
    const offset = i * chunkSize * 2;
    for (let j = 0; j < chunkSize && offset + j * 2 + 1 < buf.length; j++) {
      const val = Math.abs(buf.readInt16LE(offset + j * 2));
      if (val > max) max = val;
    }
    peaks.push(max / 32768);
  }

  try { unlinkSync(rawPath); } catch {}
  return peaks;
}
