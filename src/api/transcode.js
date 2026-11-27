/**
 * Audio transcode — converts VBR audio to WAV for accurate seeking/waveform.
 * Caches transcoded files in data/transcode/.
 * @module api/transcode
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
export const transcodeRouter = Router();

const CACHE_DIR = resolve(process.cwd(), 'data/transcode');
mkdirSync(CACHE_DIR, { recursive: true });

const AUDIO_EXTS = ['.mp3', '.aac', '.ogg', '.flac', '.m4a'];

/** Hash a path for cache key */
function hashPath(p) {
  return createHash('md5').update(p).digest('hex').slice(0, 16);
}

/**
 * Get the cached WAV path for a source file. Returns null if not cached.
 * @param {string} sourcePath
 * @returns {string|null}
 */
function getCachedWav(sourcePath) {
  const key = hashPath(sourcePath);
  const wavPath = resolve(CACHE_DIR, `${key}.wav`);
  if (!existsSync(wavPath)) return null;
  // Stale check
  const srcMtime = statSync(sourcePath).mtimeMs;
  const wavMtime = statSync(wavPath).mtimeMs;
  if (srcMtime > wavMtime) return null;
  return wavPath;
}

/**
 * Transcode an audio file to WAV.
 * @param {string} sourcePath
 * @returns {Promise<string>} Path to the WAV file
 */
async function transcodeToWav(sourcePath) {
  const key = hashPath(sourcePath);
  const wavPath = resolve(CACHE_DIR, `${key}.wav`);

  await exec(
    'ffmpeg',
    ['-i', sourcePath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-y', wavPath],
    { timeout: 300_000 },
  );

  return wavPath;
}

/**
 * GET /api/transcode?path=/abs/path.mp3
 * Returns the WAV version of an audio file (transcodes on first request).
 */
transcodeRouter.get('/transcode', async (req, res) => {
  const sourcePath = req.query.path;
  if (!sourcePath || !existsSync(sourcePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = extname(sourcePath).toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) {
    // Not a compressed audio file — serve directly
    return res.sendFile(sourcePath);
  }

  // Check cache
  let wavPath = getCachedWav(sourcePath);
  if (!wavPath) {
    try {
      wavPath = await transcodeToWav(sourcePath);
    } catch (err) {
      return res.status(500).json({ error: 'Transcode failed', detail: err.message });
    }
  }

  res.sendFile(wavPath);
});

/**
 * POST /api/transcode — pre-transcode a file (for background processing)
 * Body: { path: "/abs/path.mp3" }
 */
transcodeRouter.post('/transcode', async (req, res) => {
  const sourcePath = req.body.path;
  if (!sourcePath || !existsSync(sourcePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  let wavPath = getCachedWav(sourcePath);
  if (wavPath) return res.json({ path: wavPath, cached: true });

  try {
    wavPath = await transcodeToWav(sourcePath);
    res.json({ path: wavPath, cached: false });
  } catch (err) {
    res.status(500).json({ error: 'Transcode failed', detail: err.message });
  }
});
