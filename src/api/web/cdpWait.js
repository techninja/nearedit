/**
 * The two waits of the DevTools client: for the socket to open, and for an
 * event to arrive. Both end — with the event, with a time limit, or with
 * the browser going away.
 * @module api/web/cdpWait
 */

import WebSocket from 'ws';
import { ProtocolError } from './errors.js';

/** @typedef {import('./cdp.js').Session} Session */
/** @typedef {import('./cdp.js').Connection} Connection */

export const DEFAULT_TIMEOUT = 30_000;
/** A 3840 × 2160 × 3 screenshot is tens of megabytes of base64. */
const MAX_MESSAGE = 512 * 1024 * 1024;
export const seconds = (/** @type {number} */ ms) => `${Math.round(ms / 100) / 10} s`;

/**
 * @param {string} url
 * @param {number} timeout
 * @returns {Promise<WebSocket>} An open socket
 */
export function openSocket(url, timeout) {
  const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: MAX_MESSAGE });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new ProtocolError('The browser did not accept a DevTools connection'));
    }, timeout);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new ProtocolError(`Cannot connect to the browser: ${err.message}`));
    });
  });
}

/**
 * Wait for one event.
 * @param {Session['on']} on
 * @param {Connection['onClose']} onClose
 * @param {string} event
 * @param {{ timeout?: number, where?: (params: any) => boolean }} [options]
 * @returns {Promise<any>} The event's parameters
 */
export function waitFor(on, onClose, event, { timeout = DEFAULT_TIMEOUT, where } = {}) {
  return new Promise((resolve, reject) => {
    /** @type {(() => void)[]} */
    const undo = [];
    const settle = (/** @type {Function} */ done, /** @type {any} */ value) => {
      for (const step of undo) step();
      done(value);
    };
    const fail = (/** @type {string} */ why, /** @type {object} */ facts) =>
      settle(reject, new ProtocolError(why, { method: event, ...facts }));
    const late = () =>
      fail(`Nothing arrived (${event}) within ${seconds(timeout)}`, { timedOut: true });
    const timer = setTimeout(late, timeout);
    undo.push(() => clearTimeout(timer));
    undo.push(on(event, (params) => void ((!where || where(params)) && settle(resolve, params))));
    undo.push(onClose(() => fail(`The browser closed (waiting for ${event})`, { closed: true })));
  });
}
