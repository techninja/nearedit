/**
 * A stand-in for the server's music renderer, for tests: the same contract
 * (`renderMusic`), the same file in the same place with the same samples —
 * but rendered in this thread, chunk by chunk, so a test can cancel it at
 * a chosen moment and see what is left behind. Not part of the runtime API.
 * @module api/director/score/testing/renderer
 */

import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderer } from '#utils/music/engine/renderer.js';
import { songKey } from '#utils/music/key.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { songSeconds } from '#utils/music/timing.js';
import { pcm16, wavHeader } from '#utils/music/wav.js';

/**
 * @typedef {Object} FakeRenderer
 * @property {import('../render.js').Renderer} render
 * @property {{ key: string, cached: boolean }[]} calls - Every song asked for
 * @property {(folder: string) => string} dir - Where renderings go
 */

/**
 * @param {{ onChunk?: (done: number, total: number) => void, fail?: Error }} [opts] -
 *   `onChunk`: called after every second of sound (a test aborts from here);
 *   `fail`: thrown instead of rendering
 * @returns {FakeRenderer}
 */
export function fakeRenderer(opts = {}) {
  /** @type {FakeRenderer['calls']} */
  const calls = [];
  const dir = (/** @type {string} */ folder) => join(folder, '.nearedit', 'music');
  return {
    calls,
    dir,
    async render({ folder, song, signal, onProgress }) {
      if (opts.fail) throw opts.fail;
      const normal = normalizeSong(song);
      const key = songKey(normal);
      const file = join(dir(folder), `${key}.wav`);
      const duration = songSeconds(normal);
      const cached = existsSync(file);
      calls.push({ key, cached });
      if (cached) return { file, key, duration, cached };
      mkdirSync(dir(folder), { recursive: true });
      const partial = `${file}.part`;
      const renderer = createRenderer(normal);
      const fd = openSync(partial, 'w');
      try {
        writeSync(fd, wavHeader(renderer.frames, renderer.sampleRate));
        for (let chunk = renderer.render(48000); chunk.length; chunk = renderer.render(48000)) {
          writeSync(fd, pcm16(chunk));
          onProgress?.(renderer.position, renderer.frames);
          opts.onChunk?.(renderer.position, renderer.frames);
          // Let an abort that was asked for meanwhile arrive.
          await new Promise((resolve) => setImmediate(resolve));
          if (signal?.aborted) {
            throw Object.assign(new Error('music render cancelled'), { killedBy: 'aborted' });
          }
        }
      } catch (err) {
        closeSync(fd);
        rmSync(partial, { force: true });
        throw err;
      }
      closeSync(fd);
      renameSync(partial, file);
      return { file, key, duration: renderer.frames / renderer.sampleRate, cached: false };
    },
  };
}
