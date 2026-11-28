/**
 * Fixtures for the kit tests: a sandbox with a library and a registered
 * project, kits written by hand as a person would, raw uploads. Not a test
 * file itself.
 * @module api/kits/testkit
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import express from 'express';
import { createSandbox } from '../../../tests/server/helpers.js';
import { call } from '../../../tests/server/http.js';
import { apiNotFound, errorHandler } from '../lib/httpErrors.js';
import { kitsRouter } from '../kits.js';
import { mediaRouter } from '../media.js';
import { projectsRouter } from '../projects.js';

export { call };

/** A 1 × 1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The kit, project and media routes behind the same body parser as the
 * real server's (`src/server.js`), on a port of their own.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
async function serve() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  for (const router of [projectsRouter, mediaRouter, kitsRouter]) app.use('/api', router);
  app.use('/api', apiNotFound);
  app.use(errorHandler);
  /** @type {import('node:http').Server} */
  const server = await new Promise((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const close = () =>
    new Promise((done) => {
      server.close(() => done());
      server.closeAllConnections();
    });
  return { url: `http://127.0.0.1:${port}`, close };
}

/**
 * A sandbox whose data directory holds the library, with the kit, project
 * and media routes served from it.
 * @param {string} name
 * @returns {Promise<{ box: ReturnType<typeof createSandbox>, url: string, kits: string,
 *   project: any, write: (folder: string, kit: unknown, files?: Record<string, Buffer|string>) => string,
 *   close: () => Promise<void> }>} `write` puts a kit folder on disk by hand
 *   (`folder` relative to the library, or absolute) and returns its path
 */
export async function createKitSandbox(name) {
  const box = createSandbox(name);
  delete process.env.NEAREDIT_KITS_DIR;
  const kits = join(box.data, 'kits');
  const api = await serve();
  const made = await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
  const write = (folder, kit, files = {}) => {
    const dir = folder.startsWith('/') ? folder : join(kits, folder);
    mkdirSync(dir, { recursive: true });
    const text = typeof kit === 'string' ? kit : JSON.stringify(kit);
    writeFileSync(join(dir, 'kit.json'), text);
    for (const [file, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), bytes);
    }
    return dir;
  };
  const close = async () => {
    await api.close();
    box.cleanup();
  };
  return { box, url: api.url, kits, project: made.body, write, close };
}

/**
 * Send bytes as the body of a request, as a browser sends a file.
 * @param {string} base - Server URL
 * @param {string} path - Already encoded
 * @param {Buffer|string} bytes
 * @param {{ method?: string, type?: string, chunked?: boolean }} [opts] - `chunked`
 *   sends no Content-Length
 * @returns {Promise<{ status: number, body: any }>}
 */
export function send(base, path, bytes, opts = {}) {
  const { method = 'PUT', type = 'application/octet-stream', chunked = false } = opts;
  const data = Buffer.from(bytes);
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': type, ...(chunked ? {} : { 'Content-Length': data.length }) };
    const req = request(base + path, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text; // not JSON
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}
