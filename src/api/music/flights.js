/**
 * Renders that are shared: everyone who asks for one file while it is being
 * made waits for the same render, hears its progress, and may leave. The
 * render stops only when the last one has left.
 * @module api/music/flights
 */

import { aborted } from './render.js';

/** @typedef {(done: number, total: number) => void} OnProgress */

/**
 * @template T
 * @typedef {Object} Flight
 * @property {string} file - What is being made
 * @property {Promise<T>} promise - Settles when the render is over
 * @property {AbortController} stop - Aborted when everyone has left
 * @property {OnProgress} progress - Tells everyone who is waiting
 * @property {boolean} rendering - Set by the render once it writes to disk
 * @property {number} waiting
 * @property {Set<OnProgress>} listeners
 */

/** @type {Map<string, Flight<any>>} */
const flights = new Map();

/**
 * @param {string} file
 * @returns {Flight<any>|undefined} The render of that file that can be joined
 */
export const flightOf = (file) => flights.get(file);

/**
 * Forget a render that is over, or that nobody wants any more.
 * @param {Flight<any>} flight
 */
function land(flight) {
  if (flights.get(flight.file) === flight) flights.delete(flight.file);
}

/**
 * Start the one render of a file.
 * @template T
 * @param {string} file
 * @param {(flight: Flight<T>) => Promise<T>} run - Stops when `flight.stop` fires
 * @returns {Flight<T>}
 */
export function takeOff(file, run) {
  /** @type {Set<OnProgress>} */
  const listeners = new Set();
  const progress = (/** @type {number} */ done, /** @type {number} */ total) => {
    for (const listener of listeners) listener(done, total);
  };
  const stop = new AbortController();
  /** @type {Flight<T>} */
  const flight = { file, stop, progress, listeners, waiting: 0, rendering: false, promise: null };
  flight.promise = run(flight).finally(() => land(flight));
  flights.set(file, flight);
  return flight;
}

/**
 * Wait for a render with the others who asked for it. Leaving (the signal)
 * stops the render when nobody else is waiting; whoever asks for the file
 * after that starts a new one.
 * @template T
 * @param {Flight<T>} flight
 * @param {AbortSignal} [signal]
 * @param {OnProgress} [onProgress]
 * @returns {Promise<T>}
 * @throws {Error} What the render threw, or — when `signal` fired — an
 *   error with `killedBy: 'aborted'`
 */
export function board(flight, signal, onProgress) {
  flight.waiting++;
  if (onProgress) flight.listeners.add(onProgress);
  return new Promise((resolve, reject) => {
    let aboard = true;
    const leave = () => {
      if (!aboard) return false;
      aboard = false;
      flight.waiting--;
      if (onProgress) flight.listeners.delete(onProgress);
      signal?.removeEventListener('abort', onAbort);
      return true;
    };
    const onAbort = () => {
      if (!leave()) return;
      const gone = () => reject(aborted());
      if (flight.waiting) return gone();
      land(flight);
      flight.stop.abort();
      // The last one out is answered when the thread has stopped and its file is removed.
      if (flight.rendering) flight.promise.then(gone, gone);
      else gone();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    flight.promise.then(
      (result) => leave() && resolve(result),
      (err) => leave() && reject(err),
    );
  });
}
