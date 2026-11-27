/**
 * Filmstrip cache — one image per source file, holding `cols` frames side
 * by side (`GET /api/previews/thumbnail`). Clips ask for the strip of their
 * source while drawing; a missing strip is requested in the background and
 * the timeline redraws when it arrives.
 * @module utils/timeline/thumbCache
 */

import { query } from '#utils/api/http.js';

/** Strip height requested from the server; enough for a tall lane at 2x. */
const STRIP_HEIGHT = 96;
/** Strips kept in memory. */
const MAX_STRIPS = 240;
/** Requests in flight at once; the rest wait, newest first. */
const MAX_LOADING = 3;

/**
 * @typedef {Object} Strip
 * @property {HTMLImageElement|null} image - null until loaded
 * @property {number} cols - Frames in the strip
 * @property {'queued'|'loading'|'ready'|'error'} state
 */

/** @type {Map<string, Strip & { url: string }>} */
const strips = new Map();
/** @type {string[]} Keys waiting to load */
const queue = [];
let loading = 0;
/** @type {Set<() => void>} */
const listeners = new Set();

/** Start queued loads while there is room. */
function pump() {
  while (loading < MAX_LOADING && queue.length) {
    const entry = strips.get(queue.pop());
    if (!entry || entry.state !== 'queued') continue;
    loading++;
    entry.state = 'loading';
    const image = new Image();
    const settle = (/** @type {boolean} */ ok) => {
      loading--;
      entry.state = ok ? 'ready' : 'error';
      entry.image = ok ? image : null;
      if (ok) for (const listener of listeners) listener();
      pump();
    };
    image.onload = () => settle(true);
    image.onerror = () => settle(false);
    image.src = entry.url;
  }
}

/** Forget the least recently requested strips beyond the limit. */
function evict() {
  for (const key of strips.keys()) {
    if (strips.size <= MAX_STRIPS) return;
    if (strips.get(key).state !== 'loading') strips.delete(key);
  }
}

/**
 * The filmstrip of a source, requesting it when it is not cached yet.
 * @param {string} path - Absolute source path
 * @param {number} cols - Frames wanted (see `stripColumns`)
 * @returns {Strip} Check `state === 'ready'` before drawing `image`
 */
export function getStrip(path, cols) {
  const key = `${cols}|${path}`;
  const known = strips.get(key);
  if (known) {
    strips.delete(key); // re-insert: most recently used last
    strips.set(key, known);
    return known;
  }
  const url = `/api/previews/thumbnail${query({ path, cols, height: STRIP_HEIGHT })}`;
  const entry = { image: null, cols, state: /** @type {Strip['state']} */ ('queued'), url };
  strips.set(key, entry);
  queue.push(key);
  evict();
  pump();
  return entry;
}

/**
 * Be told when a strip has finished loading (to redraw).
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onStripLoaded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
