/**
 * Audio preparation for speech recognition: every provider gets 16 kHz mono
 * audio decoded by our own FFmpeg, so anything NearEdit can play can be
 * transcribed regardless of what the model runtime can decode.
 * @module api/intelligence/transcription/audio
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Run `work` with a private temporary directory that is always removed.
 * @template T
 * @param {(dir: string) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTempDir(work) {
  const dir = await mkdtemp(join(tmpdir(), 'nearedit-stt-'));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract speech-ready audio (16 kHz mono) from a media file.
 * @param {import('../steps/types.js').Deps['run']} run
 * @param {string} filePath
 * @param {string} outPath - `.wav` gives 16-bit PCM, `.flac` a lossless file about half the size
 * @param {{ start?: number, length?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<string>} outPath
 */
export async function extractSpeechAudio(run, filePath, outPath, options = {}) {
  const { start = 0, length, signal } = options;
  const args = ['-v', 'error', '-nostdin', '-y'];
  if (start > 0) args.push('-ss', String(start));
  if (length > 0) args.push('-t', String(length));
  args.push('-i', filePath, '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000');
  args.push('-c:a', outPath.endsWith('.flac') ? 'flac' : 'pcm_s16le', outPath);
  await run('ffmpeg', args, { signal });
  return outPath;
}
