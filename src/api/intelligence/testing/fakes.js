/**
 * Test doubles for the model-backed providers: a recording process runner
 * and local HTTP servers that speak the real wire formats.
 * @module api/intelligence/testing/fakes
 */

import { createServer } from 'node:http';
import { getSettings } from '../settings.js';
import { defaultDeps } from '../steps/types.js';

/**
 * Settings with some blocks overridden.
 * @param {{ dataDir?: string, transcription?: object, vision?: object, llm?: object }} [overrides]
 * @returns {import('../settings.js').Settings}
 */
export function settingsWith(overrides = {}) {
  const base = getSettings();
  return {
    ...base,
    dataDir: overrides.dataDir || base.dataDir,
    transcription: { ...base.transcription, ...overrides.transcription },
    vision: { ...base.vision, ...overrides.vision },
    llm: { ...base.llm, ...overrides.llm },
  };
}

/**
 * An error shaped like the ones lib/ffmpeg.js `run` rejects with.
 * @param {number|string} code - Exit code, or 'ENOENT'
 * @param {string} message
 * @returns {Error}
 */
export const exitError = (code, message) => Object.assign(new Error(message), { code });

/**
 * A process runner that records calls instead of spawning. A command with no
 * handler fails the way a missing executable does.
 * @param {Record<string, (args: string[], opts: any) => any>} handlers
 *   Return `{ stdout, stderr }`, or nothing for a silent success
 * @returns {{ deps: import('../steps/types.js').Deps, calls: { cmd: string, args: string[], opts: any }[] }}
 */
export function fakeRunner(handlers) {
  const calls = [];
  const run = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    if (!handlers[cmd]) throw exitError('ENOENT', `spawn ${cmd} ENOENT`);
    return (await handlers[cmd](args, opts)) || { stdout: '', stderr: '' };
  };
  return { deps: { ...defaultDeps, run }, calls };
}

/**
 * @typedef {Object} SeenRequest
 * @property {string} method
 * @property {string} url
 * @property {import('node:http').IncomingHttpHeaders} headers
 * @property {Buffer} body
 * @property {() => any} json - Body parsed as JSON
 * @property {() => Promise<FormData>} form - Body parsed as multipart/form-data
 */

/**
 * Start a local HTTP server. `respond` gets each request (already read) and
 * returns `{ status?, body?, headers? }`; objects are sent as JSON.
 * @param {(req: SeenRequest, index: number) => any} respond
 * @returns {Promise<{ url: string, requests: SeenRequest[], close: () => Promise<void> }>}
 */
export async function fakeServer(respond) {
  /** @type {SeenRequest[]} */
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const seen = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
      json: () => JSON.parse(body.toString()),
      form: () =>
        new Response(body, { headers: { 'content-type': req.headers['content-type'] } }).formData(),
    };
    requests.push(seen);
    const reply = (await respond(seen, requests.length - 1)) || {};
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
    res.writeHead(reply.status || 200, { 'Content-Type': 'application/json', ...reply.headers });
    res.end(text);
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', () => resolvePromise(null)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const close = () =>
    new Promise((resolvePromise) => {
      server.closeAllConnections();
      server.close(() => resolvePromise());
    });
  return { url: `http://127.0.0.1:${port}`, requests, close };
}
