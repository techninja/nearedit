#!/usr/bin/env node

/**
 * `npm run install-browser` — download chrome-headless-shell, the browser
 * web clips are recorded with, into the data folder and make sure it
 * starts. Run it once; NearEdit never downloads anything by itself.
 *
 *   node scripts/install-browser.js [--force] [--feed <url>]
 *
 * @module scripts/install-browser
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/api/lib/config.js';
import { installBrowser } from '../src/api/web/install.js';
import { browserStatus } from '../src/api/web/status.js';

const args = process.argv.slice(2);
const feedAt = args.indexOf('--feed');
const isFeed = (/** @type {number} */ i) => feedAt >= 0 && i === feedAt + 1;
const unknown = args.find((arg, i) => !['--force', '--feed'].includes(arg) && !isFeed(i));
if (unknown || (feedAt >= 0 && !args[feedAt + 1])) {
  console.error('Usage: npm run install-browser -- [--force] [--feed <url>]');
  process.exit(2);
}

// Behind a proxy Node only uses it when told to before it starts.
const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxied && !process.env.NODE_USE_ENV_PROXY) {
  const again = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(again.status ?? 1);
}

/**
 * Start the installed browser the way a recording does.
 * @param {string} path
 * @returns {Promise<string>} '' or why it does not start
 */
async function verify(path) {
  process.env.WEB_CAPTURE_BROWSER = path;
  const status = await browserStatus({ fresh: true });
  if (status.available) console.log(`It starts: ${status.browser.version}`);
  return status.reason;
}

try {
  await installBrowser({
    dataDir: getConfig().dataDir,
    log: (line) => console.log(line),
    verify,
    force: args.includes('--force'),
    ...(feedAt >= 0 && { feed: args[feedAt + 1] }),
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
