/**
 * A client for the Chrome DevTools protocol over one WebSocket: commands
 * with time limits, events, and sessions (one per page target). When the
 * browser goes away every command still waiting fails at once with a plain
 * message instead of hanging.
 * @module api/web/cdp
 */

import { DEFAULT_TIMEOUT, openSocket, seconds, waitFor } from './cdpWait.js';
import { ProtocolError } from './errors.js';

/**
 * @typedef {(params: any, sessionId: string) => void} Listener
 * @typedef {Object} Session
 * @property {string} id - '' for the browser itself
 * @property {(method: string, params?: object, timeout?: number) => Promise<any>} send
 * @property {(event: string, listener: (params: any) => void) => () => void} on - Returns the unsubscribe
 * @property {(event: string, options?: { timeout?: number, where?: (params: any) => boolean }) => Promise<any>} wait
 * @typedef {Session & { session: (id: string) => Session, close: () => void,
 *   closed: () => boolean, onClose: (listener: () => void) => () => void }} Connection
 */

/**
 * Open a connection to a browser's DevTools endpoint.
 * @param {string} url - `ws://127.0.0.1:<port>/devtools/browser/<id>`
 * @param {{ timeout?: number }} [options] - Milliseconds to wait for the socket
 * @returns {Promise<Connection>}
 */
export async function connect(url, options = {}) {
  const socket = await openSocket(url, options.timeout || 10_000);
  let nextId = 0;
  let open = true;
  /** @type {Map<number, { method: string, resolve: Function, reject: Function, timer: any }>} */
  const pending = new Map();
  /** @type {Map<string, Set<Listener>>} */
  const listeners = new Map();
  /** @type {Set<() => void>} */
  const closeListeners = new Set();

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id === undefined) {
      for (const listener of [...(listeners.get(message.method) || [])])
        listener(message.params || {}, message.sessionId || '');
      return;
    }
    const waiting = pending.get(message.id);
    if (!waiting) return; // answered after its time limit
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (!message.error) return waiting.resolve(message.result);
    const { message: text, data, code } = message.error;
    const said = `${waiting.method}: ${text}${data ? ` (${data})` : ''}`;
    waiting.reject(new ProtocolError(said, { method: waiting.method, code }));
  });
  const gone = () => {
    if (!open) return;
    open = false;
    for (const [, { method, reject, timer }] of pending) {
      clearTimeout(timer);
      const said = `The browser closed while ${method} was running`;
      reject(new ProtocolError(said, { method, closed: true }));
    }
    pending.clear();
    for (const listener of [...closeListeners]) listener();
  };
  socket.on('close', gone).on('error', gone);

  /** @type {(method: string, params: object, sessionId: string, timeout: number) => Promise<any>} */
  const send = (method, params, sessionId, timeout) =>
    new Promise((resolve, reject) => {
      if (!open)
        return reject(
          new ProtocolError(`The browser is closed (${method})`, { method, closed: true }),
        );
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        const said = `${method} did not answer within ${seconds(timeout)}`;
        reject(new ProtocolError(said, { method, timedOut: true }));
      }, timeout);
      pending.set(id, { method, resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  /** @type {Connection['onClose']} */
  const onClose = (listener) => {
    if (open) closeListeners.add(listener);
    else listener();
    return () => void closeListeners.delete(listener);
  };

  /** @type {(id: string) => Session} */
  const session = (id) => {
    /** @type {Session['on']} */
    const on = (event, listener) => {
      const scoped = (/** @type {any} */ params, /** @type {string} */ from) =>
        void (from === id && listener(params));
      const set = listeners.get(event) || new Set();
      listeners.set(event, set.add(scoped));
      return () => void set.delete(scoped);
    };
    /** @type {Session['wait']} */
    const wait = (event, options) => waitFor(on, onClose, event, options);
    const sendHere = (/** @type {string} */ method, params = {}, timeout = DEFAULT_TIMEOUT) =>
      send(method, params, id, timeout);
    return { id, send: sendHere, on, wait };
  };

  return { ...session(''), session, close: () => socket.terminate(), closed: () => !open, onClose };
}
