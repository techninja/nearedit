/**
 * Shared WebSocket connection to `/ws` with automatic reconnect.
 * The socket opens on the first subscription and closes when the last
 * subscriber leaves, so pages that never listen never connect.
 * @module utils/api/ws
 */

/** @type {WebSocket|null} */
let socket = null;
/** @type {Map<string, Set<(message: any) => void>>} */
const handlers = new Map();
/** @type {Set<(open: boolean) => void>} */
const statusListeners = new Set();
let retryTimer = 0;
let retryDelay = 500;
let open = false;

/** @returns {number} Total subscriptions across all message types. */
const subscriberCount = () => [...handlers.values()].reduce((n, set) => n + set.size, 0);

/** @param {boolean} next */
function setOpen(next) {
  if (open === next) return;
  open = next;
  for (const listener of statusListeners) listener(open);
}

/** Open the socket unless one is already open or connecting. */
function connect() {
  if (socket || subscriberCount() === 0) return;
  const scheme = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${scheme}//${globalThis.location.host}/ws`);
  socket = ws;
  ws.addEventListener('open', () => {
    retryDelay = 500;
    setOpen(true);
  });
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return; // ignore frames that are not JSON
    }
    for (const handler of handlers.get(message.type) || []) handler(message);
  });
  ws.addEventListener('close', () => {
    if (socket === ws) socket = null;
    setOpen(false);
    if (subscriberCount() === 0) return;
    clearTimeout(retryTimer);
    retryTimer = /** @type {any} */ (setTimeout(connect, retryDelay));
    retryDelay = Math.min(retryDelay * 2, 10_000);
  });
}

/**
 * Subscribe to one server message type (e.g. `job_update`).
 * @param {string} type
 * @param {(message: any) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onMessage(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(handler);
  connect();
  return () => {
    handlers.get(type)?.delete(handler);
    if (subscriberCount() > 0) return;
    clearTimeout(retryTimer);
    socket?.close();
    socket = null;
  };
}

/**
 * Observe connection state (for an "offline" indicator).
 * @param {(open: boolean) => void} listener - Called immediately, then on change
 * @returns {() => void} unsubscribe
 */
export function onConnectionChange(listener) {
  statusListeners.add(listener);
  listener(open);
  return () => statusListeners.delete(listener);
}

/** @returns {boolean} */
export const isConnected = () => open;
