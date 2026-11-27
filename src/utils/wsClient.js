/**
 * Persistent WebSocket client — maintains connection for the app lifetime.
 * Reconnects automatically. Dispatches job updates to registered handlers.
 * @module utils/wsClient
 */

/** @type {WebSocket|null} */
let ws = null;
/** @type {Map<string, Set<function>>} event type → handlers */
const handlers = new Map();
/** @type {ReturnType<typeof setTimeout>|null} */
let reconnectTimer = null;
let connected = false;

/**
 * Connect to the WebSocket server. Call once on app init.
 */
export function connectWS() {
  if (ws && ws.readyState <= 1) return; // already connected/connecting

  const url = `ws://${location.host}/ws`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    connected = true;
    console.log('[WS] Connected');
    // Check for any pending jobs on reconnect
    emit('connected', {});
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      emit(msg.type, msg);
    } catch {}
  };

  ws.onclose = () => {
    connected = false;
    console.log('[WS] Disconnected, reconnecting in 3s...');
    reconnectTimer = setTimeout(connectWS, 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

/**
 * Disconnect and stop reconnecting.
 */
export function disconnectWS() {
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  connected = false;
}

/**
 * Register a handler for a message type.
 * @param {string} type - e.g. 'job_update', 'connected'
 * @param {function} handler
 * @returns {function} unsubscribe
 */
export function onMessage(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(handler);
  return () => handlers.get(type)?.delete(handler);
}

/**
 * Emit to registered handlers.
 * @param {string} type
 * @param {object} data
 */
function emit(type, data) {
  const set = handlers.get(type);
  if (set) for (const fn of set) fn(data);
}

/** @returns {boolean} */
export function isConnected() {
  return connected;
}
