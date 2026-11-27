/**
 * Decode any media file to mono float PCM through FFmpeg and hand it out in
 * chunks, so callers can analyse long recordings without holding the decoded
 * audio in memory. Spawned with an argument array — never through a shell.
 * @module api/intelligence/dsp/pcmStream
 */

import { spawn } from 'node:child_process';

/**
 * @typedef {Object} PcmOptions
 * @property {number} [sampleRate=22050]
 * @property {AbortSignal} [signal] - Kills FFmpeg when aborted
 * @property {typeof spawn} [spawnFn] - Injectable for tests
 */

/**
 * Reinterpret little-endian float bytes as samples (copying, because a
 * Buffer's offset is not guaranteed to be 4-byte aligned).
 * @param {Buffer} bytes - Length must be a multiple of 4
 * @returns {Float32Array}
 */
function toFloats(bytes) {
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return new Float32Array(aligned.buffer);
}

/**
 * Stream a file's audio as Float32Array chunks (-1..1, mono).
 * @param {string} filePath
 * @param {PcmOptions} [options]
 * @returns {AsyncGenerator<Float32Array, void, void>}
 */
export async function* readPcm(filePath, options = {}) {
  const { sampleRate = 22050, signal, spawnFn = spawn } = options;
  if (signal?.aborted) throw new Error('ffmpeg aborted');
  const args = ['-v', 'error', '-nostdin', '-i', filePath, '-vn', '-sn', '-dn'];
  args.push('-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-');
  const child = spawnFn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
  /** @type {Promise<number|null>} */
  const closed = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code));
  });
  closed.catch(() => {}); // surfaced below; avoid an unhandled rejection meanwhile
  const kill = () => child.kill('SIGKILL');
  signal?.addEventListener('abort', kill, { once: true });

  let carry = Buffer.alloc(0);
  try {
    for await (const chunk of child.stdout) {
      const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = bytes.length - (bytes.length % 4);
      carry = bytes.subarray(usable);
      if (usable) yield toFloats(bytes.subarray(0, usable));
    }
    const code = await closed;
    if (signal?.aborted) throw new Error('ffmpeg aborted');
    if (code !== 0) {
      const tail = stderr.trim().split('\n').slice(-3).join('\n');
      throw new Error(`ffmpeg exited ${code}: ${tail}`);
    }
  } finally {
    signal?.removeEventListener('abort', kill);
    if (child.exitCode === null) kill(); // consumer stopped early or threw
  }
}
