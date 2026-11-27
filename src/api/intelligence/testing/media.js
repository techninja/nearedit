/**
 * Test media generated with FFmpeg's lavfi sources — nothing is checked in.
 * @module api/intelligence/testing/media
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../../lib/ffmpeg.js';
import { getSettings } from '../settings.js';
import { defaultDeps } from '../steps/types.js';

/**
 * @param {string} [prefix]
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function tempDir(prefix = 'nearedit-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Run FFmpeg quietly with the given arguments.
 * @param {string[]} args
 * @returns {Promise<void>}
 */
export async function ffmpeg(args) {
  await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args]);
}

/** Cut times of the video made by `makeCutsVideo`. */
export const CUT_TIMES = [2, 3.5, 6];
export const CUTS_DURATION = 8;

/**
 * An 8 s, 30 fps video that hard-cuts between four very different pictures
 * at 2 s, 3.5 s and 6 s. No audio unless `withAudio`.
 * @param {string} output
 * @param {{ withAudio?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function makeCutsVideo(output, options = {}) {
  const size = 's=640x360:r=30';
  const inputs = ['-f', 'lavfi', '-i', `testsrc2=${size}:d=2`];
  inputs.push('-f', 'lavfi', '-i', `smptebars=${size}:d=1.5`);
  inputs.push('-f', 'lavfi', '-i', `color=c=white:${size}:d=2.5`);
  inputs.push('-f', 'lavfi', '-i', `mandelbrot=${size}`);
  const graph =
    '[3:v]trim=duration=2,setpts=PTS-STARTPTS[m];' +
    '[0:v][1:v][2:v][m]concat=n=4:v=1:a=0,format=yuv420p[v]';
  const args = [...inputs];
  if (options.withAudio) args.push('-f', 'lavfi', '-i', 'sine=f=330:d=8');
  args.push('-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast');
  if (options.withAudio) args.push('-map', '4:a', '-c:a', 'aac');
  await ffmpeg([...args, output]);
  return output;
}

/**
 * Tone, silence, tone: sound in 0–2 s and 4–6 s, digital silence between.
 * @param {string} output
 * @returns {Promise<string>}
 */
export async function makeToneSilenceTone(output) {
  const tone = ['-f', 'lavfi', '-i', 'sine=f=440:d=2'];
  const graph = '[0:a]apad=pad_dur=2[a];[a][1:a]concat=n=2:v=0:a=1[out]';
  await ffmpeg([...tone, ...tone, '-filter_complex', graph, '-map', '[out]', output]);
  return output;
}

/**
 * A step context for calling a step directly in tests.
 * @param {import('../steps/types.js').MediaType} type
 * @param {Partial<import('../steps/types.js').StepContext>} [overrides]
 * @returns {import('../steps/types.js').StepContext}
 */
export function stepContext(type, overrides = {}) {
  return {
    type,
    sidecar: null,
    options: {},
    progress: () => {},
    log: () => {},
    settings: getSettings(),
    deps: defaultDeps,
    cache: new Map(),
    ...overrides,
  };
}
