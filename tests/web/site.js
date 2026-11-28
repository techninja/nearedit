/**
 * The test site of the web recorder: the pages of `site/` served from
 * 127.0.0.1 on a port of its own, a few answers that are slow, never come,
 * or lead elsewhere — and a second server, standing for an address the
 * recorder must not reach, that writes down everything that reaches it.
 * @module tests/web/site
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.png': 'image/png',
};
const PAGES = new URL('./site/', import.meta.url);

/**
 * @param {import('node:http').RequestListener} handler
 * @returns {Promise<import('node:http').Server & { url: string, port: number }>}
 */
function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler).listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve(Object.assign(server, { url: `http://127.0.0.1:${port}`, port }));
    });
  });
}

/**
 * @returns {Promise<{ url: string, port: number, allow: string,
 *   other: { url: string, port: number, hits: string[] }, close: () => Promise<void> }>}
 *   `allow` is the `WEB_CAPTURE_ALLOW` value that lets the recorder load
 *   the site (and only the site); `other.hits` lists what reached the second server
 */
export async function startSite() {
  /** @type {string[]} */
  const hits = [];
  /** @type {Set<import('node:net').Socket>} */
  const open = new Set();
  const other = await listen((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' });
    res.end('<body style="background:#f00">a secret</body>');
  });
  other.on('upgrade', (req, socket) => {
    hits.push(`UPGRADE ${req.url}`);
    socket.destroy();
  });
  const site = await listen((req, res) => {
    const url = new URL(req.url || '/', 'http://site');
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (path === '/api/slow') {
      return void setTimeout(
        () => res.writeHead(204).end(),
        Number(url.searchParams.get('ms')) || 300,
      );
    }
    if (path === '/api/never') return; // the answer never comes
    if (path === '/redirect-private') {
      return void res.writeHead(302, { location: `${other.url}/secret.html` }).end();
    }
    if (path === '/redirect-ok') return void res.writeHead(302, { location: '/second.html' }).end();
    if (path === '/download') {
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': 'attachment',
      });
      return void res.end('PK');
    }
    if (path === '/broken')
      return void res.writeHead(500, { 'content-type': 'text/html' }).end('<h1>Oops</h1>');
    if (path === '/worker.js') {
      return void res
        .writeHead(200, { 'content-type': TYPES['.js'] })
        .end('self.onfetch = () => {};');
    }
    try {
      const body = readFileSync(new URL(`.${path}`, PAGES));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
    }
  });
  for (const server of [site, other]) {
    server.on('connection', (socket) => {
      open.add(socket);
      socket.on('close', () => open.delete(socket));
    });
  }
  return {
    ...{ url: site.url, port: site.port, allow: `127.0.0.1:${site.port}` },
    other: { url: other.url, port: other.port, hits },
    close: async () => {
      for (const socket of open) socket.destroy();
      await Promise.all([site, other].map((server) => new Promise((done) => server.close(done))));
    },
  };
}
