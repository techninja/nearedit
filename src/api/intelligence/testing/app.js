/**
 * A throwaway server for route tests: a bare Express app with only the
 * intelligence and index routers, a private data directory and one
 * registered project folder.
 * @module api/intelligence/testing/app
 */

import express from 'express';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { intelligenceRouter } from '../../intelligence.js';
import { indexerRouter } from '../../indexer.js';
import { getJob } from '../../lib/jobs.js';
import { saveRegistry } from '../../lib/registry.js';
import { tempDir } from './media.js';

/** Environment that makes every provider deterministic: nothing is usable. */
export const NO_PROVIDERS = {
  TRANSCRIBE_PROVIDER: 'none',
  VISION_PROVIDER: 'none',
  LLM_PROVIDER: 'none',
  GLOBAL_MEDIA_PATHS: '',
};

/**
 * @typedef {Object} TestApp
 * @property {string} project - Registered project folder (project id "p1")
 * @property {string} outside - A folder that is NOT an allowed media root
 * @property {(path: string, body?: object) => Promise<{ status: number, body: any }>} post
 * @property {(path: string) => Promise<{ status: number, body: any, text: string, headers: Headers }>} get
 * @property {(jobId: string, timeout?: number) => Promise<import('../../lib/jobs.js').Job>} waitForJob
 * @property {() => Promise<void>} close
 */

/**
 * @returns {Promise<TestApp>}
 */
export async function startTestApp() {
  const { dir, cleanup } = tempDir('nearedit-routes-');
  const project = join(dir, 'project');
  const outside = join(dir, 'outside');
  for (const folder of [project, outside, join(dir, 'dev-media')]) mkdirSync(folder);
  Object.assign(process.env, NO_PROVIDERS, {
    NEAREDIT_DATA_DIR: join(dir, 'data'),
    NEAREDIT_MEDIA_DIR: join(dir, 'dev-media'),
  });
  saveRegistry({ p1: { path: project, name: 'Test project' } });

  const app = express();
  app.use(express.json());
  app.use('/api', intelligenceRouter, indexerRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolvePromise) => server.once('listening', resolvePromise));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const base = `http://127.0.0.1:${port}/api`;

  return {
    project,
    outside,
    async post(path, body = {}) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    },
    async get(path) {
      const res = await fetch(base + path);
      const text = await res.text();
      const json = (res.headers.get('content-type') || '').includes('json');
      return {
        status: res.status,
        body: json ? JSON.parse(text) : null,
        text,
        headers: res.headers,
      };
    },
    async waitForJob(jobId, timeout = 60_000) {
      const deadline = Date.now() + timeout;
      for (;;) {
        const job = getJob(jobId);
        if (!job) throw new Error(`Job ${jobId} does not exist`);
        if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
        if (Date.now() > deadline) throw new Error(`Job ${jobId} still ${job.status}`);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolvePromise) => server.close(resolvePromise));
      cleanup();
    },
  };
}
