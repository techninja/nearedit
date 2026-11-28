/**
 * Real Chromium for the music parity test: a throwaway static server over
 * `src/` (so the page imports the very modules the app serves, through the
 * app's import map) and a page that renders songs with them.
 * @module tests/music/browser
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "#utils/": "/utils/" } }</script>
</head><body></body></html>`;

/**
 * Serve `src/` as the app does.
 * @returns {Promise<{ url: string, close: () => void }>}
 */
async function serve() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/__page')
      return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    try {
      const body = await readFile(join(SRC, normalize(pathname)));
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
    } catch (error) {
      res.writeHead(404).end(`not found: ${error.code}`);
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Runs in the page: render a song with the app's own modules, in chunks of
 * `chunk` frames, and fingerprint the samples.
 * @param {{ song: any, chunk: number }} job
 * @returns {Promise<{ frames: number, sha: string, key: string }>}
 */
async function renderInPage({ song, chunk }) {
  const music = await import('/utils/music/index.js');
  const { sha256 } = await import('/utils/web/sha256.js');
  const renderer = music.createRenderer(song);
  const samples = new Float32Array(renderer.frames * 2);
  for (let at = 0; at < samples.length; ) {
    const part = renderer.render(chunk);
    samples.set(part, at);
    at += part.length;
  }
  return {
    frames: renderer.frames,
    sha: sha256(new Uint8Array(samples.buffer)),
    key: music.songKey(song),
  };
}

/**
 * Runs in the page: the fingerprint of the engine's arithmetic there.
 * @returns {Promise<string>}
 */
async function arithmeticInPage() {
  const { arithmeticPrint } = await import('/utils/music/engine/testSongs.js');
  return arithmeticPrint();
}

/**
 * Start Chromium on a blank page of the app. Uses the project's Playwright,
 * and `CHROMIUM_PATH` when it is set.
 * @returns {Promise<{ render: (song: any, chunk: number) => ReturnType<typeof renderInPage>,
 *   arithmetic: () => Promise<string>, version: string, close: () => Promise<void> }>}
 *   Rejects when no browser can be launched
 */
export async function openBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const server = await serve();
  const page = await browser.newPage();
  await page.goto(`${server.url}/__page`);
  return {
    version: browser.version(),
    render: (song, chunk) => page.evaluate(renderInPage, { song, chunk }),
    arithmetic: () => page.evaluate(arithmeticInPage),
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}
