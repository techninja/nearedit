/**
 * Is there a browser the recorder can use? Finds chrome-headless-shell,
 * starts it once to make sure it really is one — ordinary Chrome has no
 * begin-frame control — and remembers the answer for that file.
 * Contract: WEBCLIP.md § Server, `GET /web/status`.
 * @module api/web/status
 */

import { statSync } from 'node:fs';
import { getConfig } from '../lib/config.js';
import { WebError } from './errors.js';
import { findBrowser } from './find.js';
import { parseAllowList } from './allow.js';
import { launchBrowser } from './launch.js';

/**
 * @typedef {Object} BrowserStatus
 * @property {boolean} available
 * @property {{ path: string, version: string }} browser - Empty strings when none was found
 * @property {string} reason - Why not, and what to do; '' when available
 * @property {string[]} allow - The exceptions of `WEB_CAPTURE_ALLOW`
 */

const HOW = 'Run "npm run install-browser", or set WEB_CAPTURE_BROWSER to a chrome-headless-shell.';
const PROBE_TIMEOUT = 8000;
/** @type {Map<string, Promise<{ version: string, reason: string }>>} */
const probes = new Map();

/**
 * Start a browser and ask it for one frame.
 * @param {string} path
 * @param {boolean} noSandbox
 * @returns {Promise<{ version: string, reason: string }>}
 */
async function probe(path, noSandbox) {
  /** @type {import('./launch.js').Browser|null} */
  let browser = null;
  try {
    browser = await launchBrowser({ path, width: 320, height: 240, scale: 1, noSandbox });
    const { connection } = browser;
    const { product } = await connection.send('Browser.getVersion');
    const { targetInfos } = await connection.send('Target.getTargets');
    const page = targetInfos.find((/** @type {any} */ target) => target.type === 'page');
    const attach = { targetId: page?.targetId, flatten: true };
    const { sessionId } = await connection.send('Target.attachToTarget', attach);
    const frame = { frameTimeTicks: 1e9, interval: 33 };
    await connection
      .session(sessionId)
      .send('HeadlessExperimental.beginFrame', frame, PROBE_TIMEOUT);
    return { version: product, reason: '' };
  } catch (err) {
    if (err instanceof WebError)
      return { version: '', reason: `${err.message} ${err.detail}`.trim() };
    const reason = `${path} is not chrome-headless-shell: it has no begin-frame control (ordinary Chrome does not). ${HOW}`;
    return { version: '', reason };
  } finally {
    await browser?.close();
  }
}

/**
 * @param {{ fresh?: boolean }} [options] - `fresh`: look again instead of using what is remembered
 * @returns {Promise<BrowserStatus>}
 */
export async function browserStatus({ fresh = false } = {}) {
  const { web } = getConfig();
  const allow = parseAllowList(web.allow).map((pattern) => pattern.text);
  const found = findBrowser();
  const none = { path: '', version: '' };
  if (!found) {
    const reason = `No chrome-headless-shell was found. ${HOW}`;
    return { available: false, browser: none, reason, allow };
  }
  let stamp = 0;
  try {
    stamp = statSync(found.path).mtimeMs;
  } catch {
    const reason = `${found.path} (${found.source}) does not exist. ${HOW}`;
    return { available: false, browser: { ...none, path: found.path }, reason, allow };
  }
  const key = `${found.path}|${stamp}|${web.noSandbox}`;
  if (fresh || !probes.has(key)) probes.set(key, probe(found.path, web.noSandbox));
  const { version, reason } = await /** @type {Promise<any>} */ (probes.get(key));
  // A failure may be passing (a busy machine): the next question looks again.
  if (reason) probes.delete(key);
  return { available: !reason, browser: { path: found.path, version }, reason, allow };
}

/**
 * The browser to record with.
 * @returns {Promise<string>} Its path
 * @throws {WebError} 503 with the reason when there is none
 */
export async function requireBrowser() {
  const status = await browserStatus();
  if (!status.available) throw new WebError(503, status.reason);
  return status.browser.path;
}
