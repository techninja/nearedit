/**
 * Probing the sources of a render. Adds the two stream fields placement and
 * colour conversion need on top of the shared probe: the pixel aspect ratio
 * and the colour matrix tag.
 * @module api/render/probe
 */

import { probe, run } from '../lib/ffmpeg.js';
import { RenderError } from './errors.js';

const EXTRA_ARGS = [
  ...['-v', 'error', '-select_streams', 'v:0'],
  ...['-show_entries', 'stream=sample_aspect_ratio,color_space', '-of', 'json'],
];

/**
 * @param {AbortSignal} [signal]
 * @throws {Error} When the signal is aborted
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw Object.assign(new Error('ffprobe aborted'), { killedBy: 'aborted' });
}

/**
 * Probe one source.
 * @param {string} file
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<any|null>} The shared probe result plus `sar` and
 *   `colorSpace`; null when the file cannot be read as media
 */
export async function probeSource(file, opts = {}) {
  const base = await probe(file, opts);
  throwIfAborted(opts.signal);
  if (!base || !base.hasVideo) return base;
  try {
    const { stdout } = await run('ffprobe', [...EXTRA_ARGS, file], { ...opts, timeout: 60_000 });
    const stream = JSON.parse(stdout).streams?.[0] || {};
    return { ...base, sar: stream.sample_aspect_ratio || '', colorSpace: stream.color_space || '' };
  } catch (err) {
    throwIfAborted(opts.signal);
    console.warn(`[render] no stream details for ${file}: ${err.message}`);
    return base;
  }
}

/**
 * Probe every source of a render, a few at a time.
 * @param {string[]} files
 * @param {{ signal?: AbortSignal, concurrency?: number }} [opts]
 * @returns {Promise<Record<string, any>>} Probe per file
 * @throws {RenderError} 422 naming the first file that cannot be read
 */
export async function probeSources(files, opts = {}) {
  const { signal, concurrency = 4 } = opts;
  /** @type {Record<string, any>} */
  const probes = {};
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const result = await probeSource(file, { signal });
      if (!result || (!result.hasVideo && !result.hasAudio))
        throw new RenderError(422, `Cannot read source file: ${file}`, { detail: file });
      probes[file] = result;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return probes;
}
