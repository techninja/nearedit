/**
 * Real Chromium for the caption tests: a throwaway static server over
 * `src/` (so the page imports the very modules the app serves, through the
 * same import map and the same font stylesheet), which also serves this
 * folder's `scenes.js`, and a page that draws a scene with the captions
 * library and hands the pixels back. The way `tests/compose/browser.js`
 * does it for the compositor.
 * @module tests/captions/browser
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/vendor/fonts/fonts.css">
<script type="importmap">{ "imports": { "#utils/": "/utils/" } }</script>
</head><body></body></html>`;

/**
 * @typedef {Object} Scene
 * @property {'photo'|'bright'|'dark'} kind - The backdrop
 * @property {{ width: number, height: number, scale: number, outWidth: number,
 *   outHeight: number, fps: number }} frame
 * @property {unknown} style - A caption style
 * @property {number} time - Seconds
 * @property {unknown[]} [voices] - Lists of words; the test paragraph by default
 */

/**
 * Serve `src/` and, as `/__scenes.js`, this folder's scenes.
 * @returns {Promise<{ url: string, close: () => void }>}
 */
async function serve() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/__page') {
      return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    }
    const file =
      pathname === '/__scenes.js' ? join(HERE, 'scenes.js') : join(SRC, normalize(pathname));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Runs in the page: draw a scene with the app's own captions modules.
 * @param {Scene} scene
 * @returns {Promise<string>} The frame's RGBA bytes, base64
 */
async function drawInPage(scene) {
  const captions = await import('/utils/captions/index.js');
  const { drawScene, WORDS } = await import('/__scenes.js');
  for (const words of scene.voices || [WORDS]) {
    const { font, text } = captions.captionFontNeed(words, scene.style);
    await document.fonts.load(font, text);
  }
  const { width, height } = scene.frame;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  drawScene(ctx, captions, scene);
  const { data } = ctx.getImageData(0, 0, width, height);
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Start Chromium on a blank page of the app. Uses the project's Playwright,
 * and `CHROMIUM_PATH` when it is set.
 * @returns {Promise<{ draw: (scene: Scene) => Promise<Uint8Array>, version: string,
 *   close: () => Promise<void> }>} Rejects when no browser can be launched
 */
export async function openBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  const server = await serve();
  const page = await browser.newPage();
  await page.goto(`${server.url}/__page`);
  return {
    version: browser.version(),
    draw: async (scene) =>
      new Uint8Array(Buffer.from(await page.evaluate(drawInPage, scene), 'base64')),
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}
