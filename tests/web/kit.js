/**
 * Helpers for the web recorder's tests: find a browser (or the reason to
 * skip), record a recipe on the test site into a scratch folder, read the
 * recording back as pixels, and list whatever a test left behind. Every
 * browser a test file starts keeps its profile under that file's own
 * scratch folder, so leftovers can be told from other people's Chrome.
 * @module tests/web/kit
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import { readFrames } from '../../src/api/render/testkit.js';
import { recordRecipe } from '../../src/api/web/record.js';
import { browserStatus } from '../../src/api/web/status.js';

/** Everything of this test file lives here, browser profiles included. */
export const SCRATCH = mkdtempSync(join(tmpdir(), 'nearedit-webtest-'));
process.env.TMPDIR = SCRATCH;
// Also when a suite is skipped or dies: nothing of a test run stays behind.
process.on('exit', () => rmSync(SCRATCH, { recursive: true, force: true }));
// Root cannot use Chrome's sandbox; the product default keeps it.
if (process.getuid?.() === 0) process.env.WEB_CAPTURE_NO_SANDBOX ??= '1';

const status = await browserStatus();
/** The browser to record with; '' when there is none. */
export const BROWSER = status.available ? status.browser.path : '';
/** False, or why the tests that need a browser are skipped. */
export const SKIP = status.available ? false : `no usable chrome-headless-shell: ${status.reason}`;
export const NO_SANDBOX = process.env.WEB_CAPTURE_NO_SANDBOX === '1';

/** A small page and short rests: tests record many clips. */
export const SMALL = { viewport: { width: 640, height: 360 }, scale: 1, lead: 0.2, tail: 0.2 };

/**
 * Record a recipe and read it back.
 * @param {object} recipe - Raw; `SMALL` fills in what it leaves out
 * @param {object} [options] - Passed to `recordRecipe` (`allow`, `fps`, `signal`…)
 * @returns {Promise<{ dir: string, file: string, track: any, score: any, recipe: any,
 *   frames: Awaited<ReturnType<typeof readFrames>> }>}
 */
export async function record(recipe, options = {}) {
  const normal = normalizeRecipe({ ...SMALL, ...recipe });
  const fps = options.fps || 30;
  const key = recipeKey(normal, fps);
  const dir = options.dir || mkdtempSync(join(SCRATCH, 'rec-'));
  const file = join(dir, `${key}.mp4`);
  const track = await recordRecipe({
    ...{ recipe: normal, fps, key, output: file, trackPath: join(dir, `${key}.json`) },
    ...{ browser: BROWSER, noSandbox: NO_SANDBOX },
    ...options,
  });
  const frames = await readFrames(file, track.width, track.height);
  return { dir, file, track, frames, recipe: normal, score: compileScore(normal, fps) };
}

/**
 * The frames of step `i` of a score.
 * @param {{ fps: number, steps: { start: number, actionEnd: number, end: number }[] }} score
 * @param {number} i
 * @returns {{ S: number, A: number, E: number }} First frame, action end, hold end
 */
export function span(score, i) {
  const frame = (/** @type {number} */ seconds) => Math.round(seconds * score.fps);
  const { start, actionEnd, end } = score.steps[i];
  return { S: frame(start), A: frame(actionEnd), E: frame(end) };
}

/**
 * What this test file left behind.
 * @returns {{ processes: string[], profiles: string[] }} Processes working
 *   on anything under the scratch folder, and browser profiles still in it
 */
export function leftovers() {
  const processes = execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(SCRATCH) && !line.includes('ps -eo'));
  const profiles = readdirSync(SCRATCH).filter((name) => name.startsWith('nearedit-web-'));
  return { processes, profiles };
}

/** Remove the scratch folder; call it from the last `after` of a test file. */
export function cleanup() {
  rmSync(SCRATCH, { recursive: true, force: true });
}

/** @param {number[]} rgb @param {number[]} want @param {number} [slack] @returns {boolean} */
export const near = (rgb, want, slack = 24) => rgb.every((v, i) => Math.abs(v - want[i]) <= slack);
