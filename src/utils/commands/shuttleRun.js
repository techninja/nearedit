/**
 * Running the J / K / L shuttle. Forward at normal speed is ordinary
 * playback, sound included. Every other rate scrubs: the playhead is moved
 * frame by frame at that rate and the preview follows, silently — the
 * transport's clock plays at one speed only. The edit cursor stays put
 * while shuttling, so Space still returns to it; K leaves it where the
 * shuttle stopped.
 * @module utils/commands/shuttleRun
 */

import * as transport from '#utils/playback/transport.js';
import { nextShuttleRate, shuttleStep } from './shuttle.js';

/** Current scrub rate; 0 when not scrubbing. */
let rate = 0;
let position = 0;
/** Playhead as the last step left it: a different value means someone else moved it. */
let placed = 0;
let frame = 0;
let stamp = 0;
/** @type {Set<(rate: number) => void>} */
const listeners = new Set();

/** @returns {number} The shuttle rate now: 1 during playback, 0 when stopped */
export const shuttleRate = () => rate || (transport.isPlaying() ? 1 : 0);

/** @param {number} next */
function setRate(next) {
  if (next === rate) return;
  rate = next;
  for (const listener of listeners) listener(shuttleRate());
}

/**
 * @param {(rate: number) => void} listener - Called when the scrub rate changes
 * @returns {() => void} unsubscribe
 */
export function onShuttle(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Stop scrubbing (the playhead stays where it is).
 * @returns {boolean} false when no scrub was running
 */
export function stopShuttle() {
  if (!rate) return false;
  cancelAnimationFrame(frame);
  setRate(0);
  return true;
}

/** One animation frame of scrubbing. */
function step() {
  const now = performance.now();
  // Playback started, or the playhead was moved by hand: the shuttle yields.
  if (transport.isPlaying() || Math.abs(transport.getPosition() - placed) > 1e-6) {
    stopShuttle();
    return;
  }
  const next = shuttleStep(position, rate, (now - stamp) / 1000, transport.getDuration());
  stamp = now;
  position = next.position;
  transport.seek(position, { moveCursor: false });
  placed = transport.getPosition();
  if (next.ended) stopShuttle();
  else frame = requestAnimationFrame(step);
}

/**
 * J or L was pressed.
 * @param {1|-1} direction
 * @returns {number} The rate the shuttle now runs at
 */
export function shuttle(direction) {
  const next = nextShuttleRate(shuttleRate(), direction);
  cancelAnimationFrame(frame);
  if (next === 1) {
    setRate(0);
    transport.play();
    return 1;
  }
  // Leaving playback: stop the clock where it is, without moving the cursor.
  if (transport.isPlaying()) {
    const at = transport.getPosition();
    transport.stop();
    transport.seek(at, { moveCursor: false });
  }
  position = transport.getPosition();
  placed = position;
  stamp = performance.now();
  setRate(next);
  frame = requestAnimationFrame(step);
  return next;
}

/** K: stop the shuttle or playback right here; the cursor comes to the playhead. */
export function shuttlePause() {
  const at = transport.getPosition();
  stopShuttle();
  transport.pause();
  transport.seek(at);
}
