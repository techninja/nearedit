/**
 * The only way out for the recording browser: a small forward proxy on the
 * loopback interface that asks the gate before every connection and then
 * connects to the very address the gate checked. Because the browser never
 * resolves a name or opens a connection itself, a name that changes its
 * answer between check and use (DNS rebinding) gains nothing, and web
 * sockets and workers are covered like everything else.
 * @module api/web/proxy
 */

import { createServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';

const CONNECT_TIMEOUT = 15_000;
/** Headers that are for the proxy, not for the site. */
const HOP = new Set(['proxy-connection', 'proxy-authorization', 'proxy-authenticate']);

/**
 * Connect to the first address that accepts.
 * @param {string[]} addresses
 * @param {number} port
 * @returns {Promise<import('node:net').Socket>}
 */
async function connectAny(addresses, port) {
  let failure = new Error('no address');
  for (const host of addresses) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = netConnect({ host, port, timeout: CONNECT_TIMEOUT });
        socket.once('connect', () => resolve(socket.setTimeout(0)));
        socket.once('timeout', () => socket.destroy(new Error(`${host}:${port} did not answer`)));
        socket.once('error', reject);
      });
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

/**
 * Forward one plain-HTTP request.
 * @param {import('./gate.js').Gate} gate
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function forward(gate, req, res) {
  const url = URL.canParse(req.url || '') ? new URL(req.url || '') : null;
  if (url?.protocol !== 'http:') return void res.writeHead(400).end();
  const port = Number(url.port) || 80;
  const verdict = await gate.admit(url.hostname, port);
  // Refused: an empty page. The recorder reports the reason; nothing of it is drawn.
  if (!verdict.ok) return void res.writeHead(403, { 'content-length': 0 }).end();
  /** @type {Record<string, string[]>} */
  const headers = {};
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i];
    if (!HOP.has(name.toLowerCase())) (headers[name] ||= []).push(req.rawHeaders[i + 1]);
  }
  const socket = await connectAny(verdict.addresses, port);
  const upstream = httpRequest(
    {
      ...{ method: req.method, path: `${url.pathname}${url.search}`, headers, setHost: false },
      createConnection: () => socket, // the checked address, not a second lookup
    },
    (answer) => {
      res.writeHead(answer.statusCode || 502, answer.statusMessage, answer.rawHeaders);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

/**
 * Open a tunnel (HTTPS, web sockets).
 * @param {import('./gate.js').Gate} gate
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:net').Socket} client
 * @param {Buffer} head - Bytes the browser sent after its request
 */
async function tunnel(gate, req, client, head) {
  const target = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url || '');
  const verdict = target ? await gate.admit(target[1], Number(target[2])) : null;
  if (!verdict?.ok) return void client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
  const upstream = await connectAny(verdict.addresses, Number(target[2]));
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  upstream.write(head);
  upstream.pipe(client).pipe(upstream);
  const end = () => void (upstream.destroy(), client.destroy());
  upstream.on('error', end).on('close', end);
  client.on('error', end).on('close', end);
}

/**
 * Start the proxy.
 * @param {import('./gate.js').Gate} gate
 * @returns {Promise<{ port: number, failures: Map<string, string>, close: () => Promise<void> }>}
 *   `failures`: `host:port` → why a site that was allowed could not be reached
 */
export async function startProxy(gate) {
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  /** @type {Map<string, string>} */
  const failures = new Map();
  const server = createServer((req, res) => {
    // A site that cannot be reached is a broken connection, as it is without a proxy.
    forward(gate, req, res).catch((err) => {
      const url = URL.canParse(req.url || '') ? new URL(req.url || '') : null;
      if (url) failures.set(`${url.hostname}:${url.port || 80}`.toLowerCase(), err.message);
      res.destroy();
    });
  });
  server.on('connect', (req, /** @type {import('node:net').Socket} */ client, head) => {
    client.on('error', () => client.destroy());
    tunnel(gate, req, client, head).catch((err) => {
      failures.set((req.url || '').toLowerCase(), err.message);
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject).listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    ...{ port, failures },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
