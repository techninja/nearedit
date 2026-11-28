/**
 * The director's test site: a small product page worth demoing — a hero
 * with a call to action, features with a chart, pricing with a monthly /
 * yearly switch, a sign-up form, a dialog and a second page — served from
 * 127.0.0.1 on a port of its own. Not part of the runtime: tests and the
 * scripts that render contact sheets import it.
 * @module api/director/web/testing/site
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PAGES = new URL('./site/', import.meta.url);
const KNOWN = { '/': 'index.html', '/index.html': 'index.html', '/docs.html': 'docs.html' };

/**
 * @typedef {Object} DemoSite
 * @property {string} url - `http://127.0.0.1:<port>`
 * @property {number} port
 * @property {string} allow - The `WEB_CAPTURE_ALLOW` value that lets the recorder load it
 * @property {string[]} hits - Every path that was asked for
 * @property {() => Promise<void>} close
 */

/**
 * Start the site.
 * @returns {Promise<DemoSite>}
 */
export function startDemoSite() {
  /** @type {string[]} */
  const hits = [];
  /** @type {Set<import('node:net').Socket>} */
  const open = new Set();
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url || '/', 'http://site');
    hits.push(pathname);
    const file = KNOWN[pathname];
    if (!file) return void res.writeHead(404, { 'content-type': 'text/html' }).end('Not found');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(new URL(file, PAGES)));
  });
  server.on('connection', (socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve({
        ...{ url: `http://127.0.0.1:${port}`, port, allow: `127.0.0.1:${port}`, hits },
        close: () => {
          for (const socket of open) socket.destroy();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}
