/**
 * Fixtures for the cutout tests: a sandbox with one registered project, the
 * fake matte program as `CUTOUT_COMMAND`, and what a test may leave behind
 * — files and processes. Pictures are in `./pixels.js`. Not a test file
 * itself.
 * @module tests/cutout/kit
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutoutDir } from '../../src/api/cutout/index.js';
import { createSandbox } from '../server/helpers.js';

export { call, serve } from '../server/helpers.js';
export * from './pixels.js';
export { ellipse } from './shapes.js';

export const FAKE = fileURLToPath(new URL('./fakeMatte.js', import.meta.url));
export const SINK = fileURLToPath(new URL('./slowSink.js', import.meta.url));
export const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Wait until something is so.
 * @param {() => any} check
 * @param {number} [ms=5000]
 * @returns {Promise<any>} What `check` gave when it became truthy, or its last answer
 */
export async function until(check, ms = 5000) {
  let found = await check();
  for (let waited = 0; !found && waited < ms; waited += 25) {
    await sleep(25);
    found = await check();
  }
  return found;
}

/**
 * Make the fake matte program the provider. Its command line names the
 * sandbox (the file it logs its runs to), so `leftovers` can tell this
 * test's processes from another's.
 * @param {{ root: string }} box
 * @param {string} [flags] - How it behaves: `--shape luma --delay 20`…
 * @returns {string} The `CUTOUT_COMMAND` that was set
 */
export function useFake(box, flags = '') {
  const log = join(box.root, 'runs.log');
  process.env.CUTOUT_COMMAND = `"${process.execPath}" "${FAKE}" --log "${log}" ${flags}`.trim();
  return process.env.CUTOUT_COMMAND;
}

/**
 * @param {{ root: string }} box
 * @returns {string[]} The frame sizes the fake matte program was started
 *   with, one per run, without the two-frame checks of `cutoutStatus`
 */
export function fakeRuns(box) {
  let text = '';
  try {
    text = readFileSync(join(box.root, 'runs.log'), 'utf8');
  } catch {
    return []; // it never ran
  }
  const sizes = text
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' ')[1]);
  return sizes.filter((size) => size !== '64x64');
}

/**
 * A sandbox whose project is registered as `p1`.
 * @param {string} name
 * @returns {ReturnType<typeof createSandbox> & { cutouts: string }} `cutouts`
 *   is where the project's cutout files live
 */
export function cutoutSandbox(name) {
  const box = createSandbox(name);
  const registry = { p1: { path: box.project, name: 'Cutouts' } };
  writeFileSync(join(box.data, 'registry.json'), JSON.stringify(registry));
  return { ...box, cutouts: cutoutDir(box.project) };
}

/**
 * @param {string} folder - A project folder
 * @returns {string[]} What is in its cutout folder besides whole pairs:
 *   partial files, a picture without its description, anything else
 */
export function debris(folder) {
  let names;
  try {
    names = readdirSync(cutoutDir(folder));
  } catch {
    return []; // nothing was ever cut out here
  }
  const stems = names.map((name) => /^([0-9a-f]{20})\.(mp4|json)$/.exec(name));
  return names.filter((name, i) => {
    const other = stems[i] && `${stems[i][1]}.${stems[i][2] === 'mp4' ? 'json' : 'mp4'}`;
    return !other || !names.includes(other);
  });
}

/** @returns {string} The processes of this machine, a line each; '' where there is no `ps` */
function processList() {
  try {
    return execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  } catch {
    return ''; // no `ps` here: the pipeline's own bookkeeping has to do
  }
}

/** Whether running processes can be listed here: what `leftovers` says is only worth asserting then. */
export const canList = processList() !== '';

/**
 * @param {string} root - A sandbox
 * @returns {string[]} The processes still running whose command line names
 *   it: FFmpeg reading or writing there, the fake matte program logging there
 */
export function leftovers(root) {
  return processList()
    .split('\n')
    .filter((line) => line.includes(root));
}
