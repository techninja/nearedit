/**
 * WebSocket endpoint `/ws` — pushes job updates to connected browsers.
 * Server → client only: `{ type: 'connected' }` on connect, then one
 * `{ type: 'job_update', job }` per job change (see API.md § Jobs).
 * @module api/ws
 */

// @ts-ignore -- the installed @types/ws (7.x) predates the named ESM exports of ws 8;
// "ignore" rather than "expect-error" so a newer @types/ws does not break the type-check
import { WebSocketServer } from 'ws';
import { subscribe } from './lib/jobs.js';

const HEARTBEAT_MS = 30_000;
/** Nothing a client sends is acted on, so there is no reason to accept much. */
const MAX_INBOUND_BYTES = 16 * 1024;
/** A client this far behind on reading is treated as gone. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/**
 * Only pages served by this server may connect. Browsers do not apply the
 * same-origin policy to WebSockets, so without this any web page the user
 * visits could listen in on job updates. Non-browser clients send no Origin
 * header and are let through.
 * @param {{ origin?: string, req: import('node:http').IncomingMessage }} info
 * @returns {boolean}
 */
function sameOrigin({ origin, req }) {
  if (!origin) return true;
  // Behind a reverse proxy the public host arrives in X-Forwarded-Host. A web
  // page cannot set that header on a WebSocket handshake, so trusting it is safe.
  const hosts = [req.headers.host, req.headers['x-forwarded-host']];
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false; // an unparseable Origin is not ours
  }
}

/**
 * Attach the WebSocket server to an HTTP server.
 *
 * Every client is pinged on a heartbeat; one that has not answered the
 * previous ping (a closed laptop, a dropped Wi-Fi link) is terminated, so
 * dead sockets do not pile up as job-update subscribers.
 * @param {import('node:http').Server} server
 * @param {{ heartbeatMs?: number }} [opts]
 * @returns {import('ws').Server}
 */
export function attachWebSocket(server, opts = {}) {
  const { heartbeatMs = HEARTBEAT_MS } = opts;
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_INBOUND_BYTES,
    verifyClient: sameOrigin,
  });
  /** @type {WeakSet<object>} Sockets that answered the most recent ping */
  const alive = new WeakSet();

  wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));

    const unsubscribe = subscribe((message) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate();
      ws.send(message);
    });
    ws.on('close', unsubscribe);
    // An 'error' is always followed by 'close'; it only needs to be visible.
    ws.on('error', (err) => console.warn(`[ws] client error: ${err.message}`));

    ws.send(JSON.stringify({ type: 'connected' }));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  wss.on('close', () => clearInterval(heartbeat));
  // ws re-emits the HTTP server's errors, and an 'error' event nobody listens
  // for would crash the process. Listen failures are reported by server.js.
  wss.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
    if (err.syscall !== 'listen') console.error('[ws] server error:', err.message);
  });
  return wss;
}
