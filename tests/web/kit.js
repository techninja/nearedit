/**
 * Helpers for the web recorder's tests: find a browser (or the reason to
 * skip), record a recipe on the test site into a scratch folder, read the
 * recording back as pixels, and list whatever a test left behind. Every
 * browser a test file starts keeps its profile under that file's own
 * scratch folder, so leftovers can be told from other people's Chrome.
 * @module tests/web/kit
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import { readFrames } from '../../src/api/render/testkit.js';
import { recordRecipe } from '../../src/api/web/record.js';
import { takeSnapshot } from '../../src/api/web/snapshot.js';
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
 * @param {object} [options] - Passed to `recordRecipe` (`allow`, `fps`, `signal`…). `agree:
 *   false` leaves out the comparison with a snapshot of the same recipe
 * @returns {Promise<{ dir: string, file: string, track: any, score: any, recipe: any,
 *   frames: Awaited<ReturnType<typeof readFrames>> }>}
 */
export async function record(recipe, { agree, ...options } = {}) {
  const normal = normalizeRecipe({ ...SMALL, ...recipe });
  const fps = options.fps || 30;
  const key = recipeKey(normal, fps);
  const dir = options.dir || mkdtempSync(join(SCRATCH, 'rec-'));
  const file = join(dir, `${key}.mp4`);
  const how = { browser: BROWSER, noSandbox: NO_SANDBOX, ...options };
  const paths = { key, output: file, trackPath: join(dir, `${key}.json`) };
  const outcome = await recordRecipe({ recipe: normal, fps, ...paths, ...how }).then(
    (track) => ({ track, error: null }),
    (error) => ({ track: null, error }),
  );
  // Unless the test interferes with the recording itself (it cancels it, kills the browser…).
  if (agree ?? !(options.signal || options.onFrame))
    await sameAsSnapshot(normal, fps, how, outcome.error);
  if (outcome.error) throw outcome.error;
  const { track } = outcome;
  const frames = await readFrames(file, track.width, track.height);
  return { dir, file, track, frames, recipe: normal, score: compileScore(normal, fps) };
}

/**
 * What a snapshot can do, a recording can do, and what stops one stops the
 * other at the same step: every recipe a test records is also played by a
 * snapshot, and the two must end alike.
 * @param {object} recipe - Normalised
 * @param {number} fps
 * @param {object} how - The options of the recording
 * @param {any} failure - What the recording threw; null when it succeeded
 */
async function sameAsSnapshot(recipe, fps, how, failure) {
  const { browser, noSandbox, allow, storage, watchdog, setting } = how;
  // A page may name itself by chance (a blob address): that part is not compared.
  const told = (/** @type {any} */ err) =>
    err ? `failed at step ${err.step}: ${err.message.replace(/[0-9a-f-]{36}/g, '…')}` : 'succeeded';
  const snapshot = await takeSnapshot({
    ...{ recipe, fps, browser, noSandbox, allow, storage, watchdog, setting },
  }).then(
    () => null,
    (err) => err,
  );
  const what = `${recipe.url} ${JSON.stringify(recipe.steps.map((step) => step.do))}`;
  assert.equal(
    told(snapshot),
    told(failure),
    `a snapshot and a recording of ${what} must end alike`,
  );
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
