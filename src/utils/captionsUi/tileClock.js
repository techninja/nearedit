/**
 * One clock for every caption tile on screen, so that they move in step —
 * the same word marked in all of them — and so that nothing runs when no
 * tile is listening or the page is hidden. Tiles are redrawn at half the
 * display's rate: plenty for a caption, and half the work.
 * @module utils/captionsUi/tileClock
 */

/** @type {Set<(seconds: number) => void>} */
const listeners = new Set();
let frame = 0;
let started = 0;
let skip = false;

/** @param {number} now - Milliseconds, from `requestAnimationFrame` */
function tick(now) {
  frame = listeners.size ? requestAnimationFrame(tick) : 0;
  skip = !skip;
  if (skip || document.hidden) return;
  const seconds = (now - started) / 1000;
  for (const listener of [...listeners]) listener(seconds);
}

/**
 * Be called with the clock's time while it runs.
 * @param {(seconds: number) => void} listener
 * @returns {() => void} Stop listening; the clock stops with its last listener
 */
export function onTileTick(listener) {
  if (!listeners.size) started = performance.now();
  listeners.add(listener);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** @returns {boolean} True when the person asked their system for less motion */
export function prefersStill() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Be told when that preference changes.
 * @param {() => void} listener
 * @returns {() => void} Stop listening
 */
export function onMotionPreference(listener) {
  const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
