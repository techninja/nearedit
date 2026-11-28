/**
 * Finding chrome-headless-shell on this machine, in the order WEBCLIP.md
 * gives: `WEB_CAPTURE_BROWSER`, the copy `npm run install-browser` put in
 * the data folder, Playwright's cache, Puppeteer's cache. Nothing is
 * started here; whether a file really is a headless shell is `status.js`.
 * @module api/web/find
 */

import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../lib/config.js';

/**
 * @typedef {Object} Found
 * @property {string} path - The executable
 * @property {string} source - Where it came from, for messages: `WEB_CAPTURE_BROWSER`,
 *   `installed`, `playwright` or `puppeteer`
 * @typedef {Object} Where
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [platform] - `process.platform`
 * @property {string} [home]
 * @property {string} [dataDir]
 */

/** The folder inside the data folder that `scripts/install-browser.js` fills. */
export const INSTALL_FOLDER = 'browsers';
const OWN_DATA = fileURLToPath(new URL('../../../data', import.meta.url));

/** @param {string} platform @returns {string[]} File names of a headless shell */
const binaryNames = (platform) =>
  ['chrome-headless-shell', 'headless_shell'].map((name) =>
    platform === 'win32' ? `${name}.exe` : name,
  );

/**
 * Order folder names so the highest version comes first ("131.0.6778.85"
 * before "99.0.1", "…-1243" before "…-1148").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function newestFirst(a, b) {
  const numbers = (/** @type {string} */ name) => (name.match(/\d+/g) || []).map(Number);
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (y[i] ?? -1) - (x[i] ?? -1);
  }
  return b.localeCompare(a);
}

/** @param {string} dir @returns {import('node:fs').Dirent[]} Its entries; none when unreadable */
function entries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // not there, or not ours to read: nothing to find in it
  }
}

/** @param {string} file @returns {boolean} */
function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false; // a dangling link or a vanished file is not a browser
  }
}

/**
 * The first headless shell under a folder, newest version first.
 * @param {string} dir
 * @param {string[]} names
 * @param {number} depth - Levels of sub-folders still to look into
 * @param {(name: string) => boolean} [only] - Which sub-folders of `dir` count
 * @returns {string} '' when there is none
 */
function search(dir, names, depth, only) {
  for (const name of names) if (isFile(join(dir, name))) return join(dir, name);
  if (depth <= 0) return '';
  const folders = entries(dir)
    .filter(
      (entry) => (entry.isDirectory() || entry.isSymbolicLink()) && (!only || only(entry.name)),
    )
    .map((entry) => entry.name)
    .sort(newestFirst);
  for (const folder of folders) {
    const found = search(join(dir, folder), names, depth - 1);
    if (found) return found;
  }
  return '';
}

/**
 * Where Playwright and Puppeteer keep the browsers they download.
 * @param {Required<Where>} where
 * @returns {{ playwright: string, puppeteer: string }}
 */
export function cacheFolders({ env, platform, home }) {
  const caches = {
    darwin: join(home, 'Library', 'Caches'),
    win32: env.LOCALAPPDATA || join(home, 'AppData', 'Local'),
  };
  const cache = caches[platform] || env.XDG_CACHE_HOME || join(home, '.cache');
  const chosen = env.PLAYWRIGHT_BROWSERS_PATH;
  return {
    playwright: chosen && chosen !== '0' ? resolve(chosen) : join(cache, 'ms-playwright'),
    puppeteer: join(
      env.PUPPETEER_CACHE_DIR || join(home, '.cache', 'puppeteer'),
      'chrome-headless-shell',
    ),
  };
}

/**
 * Find the browser to record with.
 * @param {Where} [where] - Defaults to this machine; tests pass their own
 * @returns {Found|null} A `WEB_CAPTURE_BROWSER` that is set is always the
 *   answer, also when the file is missing: the person chose it, and should
 *   hear that it is wrong rather than get another browser silently
 */
export function findBrowser(where = {}) {
  const env = where.env || process.env;
  const platform = where.platform || process.platform;
  const all = {
    env,
    platform,
    home: where.home || homedir(),
    dataDir: where.dataDir || getConfig().dataDir,
  };
  const chosen = (env.WEB_CAPTURE_BROWSER || '').trim();
  if (chosen) return { path: resolve(chosen), source: 'WEB_CAPTURE_BROWSER' };
  const names = binaryNames(platform);
  const caches = cacheFolders(all);
  /** @type {[string, string, number, ((name: string) => boolean)?][]} */
  const places = [
    ['installed', join(all.dataDir, INSTALL_FOLDER), 3],
    // The command line runs from anywhere: the copy in NearEdit's own data folder counts too.
    ['installed', where.dataDir ? '' : join(OWN_DATA, INSTALL_FOLDER), 3],
    ['playwright', caches.playwright, 2, (name) => name.startsWith('chromium_headless_shell')],
    ['puppeteer', caches.puppeteer, 2],
  ];
  for (const [source, dir, depth, only] of places) {
    const path = dir ? search(dir, names, depth, only) : '';
    if (path) return { path, source };
  }
  return null;
}
