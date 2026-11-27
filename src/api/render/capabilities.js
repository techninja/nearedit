/**
 * What the installed FFmpeg can do — detected once per process. The plan
 * builder degrades around missing features instead of emitting a graph that
 * FFmpeg would reject.
 * @module api/render/capabilities
 */

import { run } from '../lib/ffmpeg.js';
import { RenderError } from './errors.js';

/**
 * @typedef {Object} Capabilities
 * @property {string} version - e.g. "6.1.1", '' when unknown
 * @property {boolean} libx264
 * @property {boolean} limiterLatency - alimiter can compensate its look-ahead delay (5.1+)
 * @property {string} graphFlag - Option that reads the filter graph from a file
 */

/** @type {Promise<Capabilities>|null} */
let cached = null;

/**
 * Interpret FFmpeg's own descriptions of itself.
 * @param {{ version: string, encoder: string, limiter?: string }} text -
 *   Output of `-version`, `-h encoder=libx264`, `-h filter=alimiter`
 * @returns {Capabilities}
 */
export function parseCapabilities(text) {
  const match = /ffmpeg version n?(\d+)\.(\d+)(?:\.(\d+))?/.exec(text.version);
  const major = match ? Number(match[1]) : 0;
  return {
    version: match ? match.slice(1).filter(Boolean).join('.') : '',
    libx264: /Encoder libx264/.test(text.encoder),
    limiterLatency: /\blatency\b/.test(text.limiter || ''),
    // 7.0 added "-/option file" and deprecated -filter_complex_script.
    // Unversioned (git) builds are newer than that.
    graphFlag: match && major < 7 ? '-filter_complex_script' : '-/filter_complex',
  };
}

/**
 * @returns {Promise<Capabilities>}
 * @throws {RenderError} 503 when FFmpeg cannot be run at all
 */
async function detect() {
  const ask = async (args) => {
    const { stdout } = await run('ffmpeg', ['-hide_banner', ...args], { timeout: 20_000 });
    return stdout;
  };
  try {
    const [version, encoder, limiter] = await Promise.all([
      ask(['-version']),
      ask(['-h', 'encoder=libx264']),
      ask(['-h', 'filter=alimiter']),
    ]);
    return parseCapabilities({ version, encoder, limiter });
  } catch (err) {
    throw new RenderError(503, 'FFmpeg is not available', { detail: err.message });
  }
}

/**
 * Capabilities of the FFmpeg on PATH (cached; a failed detection is retried).
 * @returns {Promise<Capabilities>}
 */
export function getCapabilities() {
  if (!cached) {
    cached = detect();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
