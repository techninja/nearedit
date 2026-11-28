/**
 * Installing chrome-headless-shell: the current stable build for this
 * machine from Chrome for Testing, unpacked into the data folder, where
 * `find.js` looks for it. Nothing here runs unless a person runs
 * `npm run install-browser`.
 * @module api/web/install
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { INSTALL_FOLDER } from './find.js';
import { unzip } from './unzip.js';

/** Where Google publishes the builds that are known to be good. */
export const FEED =
  'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';

/**
 * @param {string} [platform] - `process.platform`
 * @param {string} [arch] - `process.arch`
 * @returns {string} The feed's name for this machine; '' when it has no build for it
 */
export function feedPlatform(platform = process.platform, arch = process.arch) {
  const names = {
    'linux-x64': 'linux64',
    'darwin-arm64': 'mac-arm64',
    'darwin-x64': 'mac-x64',
    'win32-x64': 'win64',
    'win32-ia32': 'win32',
  };
  return names[`${platform}-${arch}`] || '';
}

/**
 * @param {string} url
 * @param {string} what - For the error message
 * @returns {Promise<Response>}
 */
async function get(url, what) {
  // A minute to begin answering; the download itself may take as long as it takes.
  const waiting = new AbortController();
  const patience = setTimeout(() => waiting.abort(), 60_000);
  const answer = await fetch(url, { signal: waiting.signal })
    .catch((err) => {
      const cause = waiting.signal.aborted ? 'no answer' : err.cause?.code || err.cause?.message;
      throw new Error(`Cannot download ${what} (${url}): ${cause || err.message}`);
    })
    .finally(() => clearTimeout(patience));
  if (!answer.ok) throw new Error(`Cannot download ${what} (${url}): HTTP ${answer.status}`);
  return answer;
}

/**
 * Install the current stable chrome-headless-shell.
 * @param {Object} options
 * @param {string} options.dataDir - `NEAREDIT_DATA_DIR`
 * @param {(line: string) => void} options.log
 * @param {(path: string) => Promise<string>} options.verify - Starts the browser; '' or why it failed
 * @param {string} [options.feed] - Another address for the list of builds (a mirror)
 * @param {boolean} [options.force] - Download again although that version is there
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 * @returns {Promise<{ path: string, version: string, downloaded: boolean }>}
 * @throws {Error} Saying what failed and what to do about it
 */
export async function installBrowser({ dataDir, log, verify, feed = FEED, force, platform, arch }) {
  const name = feedPlatform(platform, arch);
  if (!name)
    throw new Error(
      `Chrome for Testing has no chrome-headless-shell for ${platform || process.platform}-${arch || process.arch}. ` +
        'Playwright builds one: npx playwright install chromium-headless-shell (it is found there too).',
    );
  const list = await (await get(feed, 'the list of Chrome builds')).json();
  const stable = list?.channels?.Stable;
  const build = stable?.downloads?.['chrome-headless-shell']?.find(
    (entry) => entry.platform === name,
  );
  if (!stable?.version || !build?.url)
    throw new Error(`${feed} lists no chrome-headless-shell for ${name}`);
  const folder = join(dataDir, INSTALL_FOLDER, 'chrome-headless-shell', stable.version);
  const exe = (platform || process.platform) === 'win32' ? '.exe' : '';
  const path = join(folder, `chrome-headless-shell-${name}`, `chrome-headless-shell${exe}`);
  const present = existsSync(path) && !force;
  if (present) log(`chrome-headless-shell ${stable.version} is already installed`);
  else {
    log(`Downloading chrome-headless-shell ${stable.version} for ${name}`);
    log(`  from ${build.url}`);
    const archive = `${folder}.zip.part`;
    const unpacked = `${folder}.part`;
    mkdirSync(join(folder, '..'), { recursive: true });
    try {
      const answer = await get(build.url, 'chrome-headless-shell');
      await pipeline(
        Readable.fromWeb(/** @type {any} */ (answer.body)),
        createWriteStream(archive),
      );
      rmSync(unpacked, { recursive: true, force: true });
      const files = unzip(archive, unpacked);
      if (
        !existsSync(join(unpacked, `chrome-headless-shell-${name}`, `chrome-headless-shell${exe}`))
      )
        throw new Error(
          `The archive holds no chrome-headless-shell-${name}/chrome-headless-shell${exe}`,
        );
      rmSync(folder, { recursive: true, force: true });
      renameSync(unpacked, folder);
      log(`Unpacked ${files.length} files into ${folder}`);
    } finally {
      rmSync(archive, { force: true });
      rmSync(unpacked, { recursive: true, force: true });
    }
  }
  const failure = await verify(path);
  if (failure) throw new Error(`It is installed at ${path}, but does not start: ${failure}`);
  log(`Ready: ${path}`);
  return { path, version: stable.version, downloaded: !present };
}
