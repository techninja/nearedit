/**
 * Starting and stopping the browser. `close()` always ends with the whole
 * process group gone and the profile folder removed — after a recording, a
 * failure, a cancellation or a crash alike. And should this process itself
 * be killed, the browser notices (its debugging pipe closes) and exits.
 * @module api/web/launch
 */

import { spawn, spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { connect } from './cdp.js';
import { WebError } from './errors.js';
import { browserArgs } from './flags.js';
import { createProfile, removeProfile } from './profiles.js';

const START_TIMEOUT = 20_000;
const SMALL_SHM = 512 * 1024 * 1024;

/**
 * @typedef {Object} Browser
 * @property {import('./cdp.js').Connection} connection
 * @property {number} pid
 * @property {string} profileDir
 * @property {Promise<void>} exited - Resolves when the process is gone, however it went
 * @property {() => Promise<void>} close - Idempotent; never throws
 */

/** @returns {boolean} True where Chrome's shared memory would not fit in /dev/shm */
function smallShm() {
  if (process.platform !== 'linux') return false;
  try {
    const { bavail, bsize } = statfsSync('/dev/shm');
    return bavail * bsize < SMALL_SHM;
  } catch {
    return true; // no /dev/shm at all: Chrome must use the temporary folder
  }
}

/**
 * End a process and everything it started.
 * @param {import('node:child_process').ChildProcess} child
 */
function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL'); // the group: renderers, GPU and network processes too
  } catch {
    child.kill('SIGKILL'); // the group is already gone; make sure of the leader
  }
}

/**
 * What Chrome said when it would not start, with the usual remedy.
 * @param {string} path
 * @param {string} said
 * @returns {WebError}
 */
function startFailure(path, said) {
  const detail = said.trim().split('\n').slice(-3).join(' | ');
  const sandbox = /sandbox/i.test(said)
    ? ' Chrome cannot use its sandbox here (running as root, or in a container without user namespaces): set WEB_CAPTURE_NO_SANDBOX=1.'
    : '';
  return new WebError(503, `The browser could not start: ${path}.${sandbox}`, { detail });
}

/**
 * Start chrome-headless-shell and connect to it.
 * @param {{ path: string, width: number, height: number, scale: number, noSandbox?: boolean,
 *   proxyPort?: number }} how
 * @returns {Promise<Browser>}
 * @throws {WebError} 503 when it does not start; nothing is left behind
 */
export async function launchBrowser({ path, ...view }) {
  /** @type {import('node:child_process').ChildProcess|null} */
  let child = null;
  const profileDir = createProfile(() => () => child && killTree(child));
  // Besides the port the recorder talks through, a debugging pipe is held
  // open and never used: when it closes, Chrome exits by itself.
  child = spawn(path, browserArgs({ ...view, profileDir, smallShm: smallShm() }), {
    detached: process.platform !== 'win32', // its own process group, so the group can be ended
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  const running = child;
  let tail = '';
  /** @type {import('./cdp.js').Connection|null} */
  let connection = null;
  /** @type {Promise<void>|null} */
  let closing = null;
  const exited = new Promise((resolve) => {
    running.once('error', (err) => {
      tail += `\n${err.message}`;
      resolve(undefined);
    });
    running.once('close', () => resolve(undefined));
  });
  const close = () => {
    closing ||= (async () => {
      connection?.close();
      killTree(running);
      await exited;
      removeProfile(profileDir);
    })().catch((err) => console.warn(`[web] could not clean up ${profileDir}: ${err.message}`));
    return closing;
  };
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(startFailure(path, tail || 'no answer')),
        START_TIMEOUT,
      );
      running.stderr?.on('data', (chunk) => {
        tail = (tail + chunk).slice(-4000);
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(tail);
        if (!match) return;
        clearTimeout(timer);
        resolve(match[1]);
      });
      exited.then(() => {
        clearTimeout(timer);
        reject(startFailure(path, tail || 'it exited at once'));
      });
    });
    connection = await connect(url);
    exited.then(() => connection?.close());
    return { connection, pid: /** @type {number} */ (running.pid), profileDir, exited, close };
  } catch (err) {
    await close();
    throw err instanceof WebError ? err : startFailure(path, `${tail}\n${err.message}`);
  }
}
