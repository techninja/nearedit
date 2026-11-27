/**
 * Real Chromium for the compositor tests: a throwaway static server over
 * `src/` (so the page imports the very modules the app serves, through the
 * same import map and the same font stylesheet) and a page that draws a
 * document with `drawFrame` and hands the pixels back.
 * @module tests/compose/browser
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
};
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/vendor/fonts/fonts.css">
<script type="importmap">{ "imports": { "#utils/": "/utils/" } }</script>
</head><body></body></html>`;

/**
 * @typedef {Object} Job
 * @property {any} edl
 * @property {number} time
 * @property {number} width
 * @property {number} height
 * @property {Record<string, string>} [images] - Media path → file on disk
 * @property {Record<string, string>} [footage] - clipId → media path whose
 *   picture stands in for that clip's footage frame
 */

/**
 * Serve `src/` and, under `/__file`, files of the fixture folder.
 * @param {string} fixtures - The only folder `/__file` reads from
 * @returns {Promise<{ url: string, close: () => void }>}
 */
async function serve(fixtures) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__page') {
      return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    }
    const wanted = url.searchParams.get('path') || '';
    const file =
      url.pathname === '/__file'
        ? join(fixtures, basename(wanted))
        : join(SRC, normalize(url.pathname));
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
 * Runs in the page: draw a job with the app's own compositor modules.
 * @param {Job} job
 * @returns {Promise<string>} The frame's RGBA bytes, base64
 */
async function drawInPage(job) {
  const mod = '/utils/compose/index.js';
  const { drawFrame, frameInfo, requirements } = await import(mod);
  const state = (globalThis.__compose ||= { images: new Map(), env: null });
  for (const [path, file] of Object.entries(job.images || {})) {
    if (state.images.has(path)) continue;
    const image = new Image();
    image.src = `/__file?path=${encodeURIComponent(file)}`;
    await image.decode();
    state.images.set(path, image);
  }
  for (const { font, text } of requirements(job.edl).fonts) await document.fonts.load(font, text);
  const createCanvas = (width, height) =>
    Object.assign(document.createElement('canvas'), { width, height });
  state.footage = job.footage || {};
  state.env ||= {
    createCanvas,
    image: (path) => state.images.get(path) || null,
    frameOf: (clip) => state.images.get(state.footage[clip.clipId]) || null,
    fontReady: (font, text) => document.fonts.check(font, text),
  };
  const canvas = createCanvas(job.width, job.height);
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, job.edl, job.time, state.env, frameInfo(job.edl, job.width, job.height));
  const { data } = ctx.getImageData(0, 0, job.width, job.height);
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Start Chromium on a blank page of the app. Uses the project's Playwright,
 * and `CHROMIUM_PATH` when it is set.
 * @param {string} fixtures - Folder holding the image files jobs refer to
 * @returns {Promise<{ draw: (job: Job) => Promise<Uint8Array>, version: string,
 *   close: () => Promise<void> }>} Rejects when no browser can be launched
 */
export async function openBrowser(fixtures) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  const server = await serve(fixtures);
  const page = await browser.newPage();
  await page.goto(`${server.url}/__page`);
  return {
    version: browser.version(),
    draw: async (job) =>
      new Uint8Array(Buffer.from(await page.evaluate(drawInPage, job), 'base64')),
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}
