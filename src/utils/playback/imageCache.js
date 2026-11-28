/**
 * Still-image cache for the compositor — decoded once, drawn many times.
 *
 * A file may be replaced under the name it had (a kit's logo): nothing in a
 * document changes then, so a cache would go on showing the picture it
 * decoded. `dropStill(url)` is for whoever replaced the file: every cache
 * forgets that still, tells its owner — a paused preview then asks for the
 * picture again and paints when it has arrived — and reads the file from an
 * address the browser has not read before, so its own caches cannot hand
 * the old bytes back.
 * @module utils/playback/imageCache
 */

/** Stills kept decoded; the least recently drawn are dropped beyond this. */
const MAX_IMAGES = 24;

/** @type {Map<string, string>} By URL, a mark for the file as it is since it was last replaced */
const revisions = new Map();
/** Marks are unlike any made before — in this session, an earlier one, or by another cache. */
const born = Date.now().toString(36);
let drops = 0;
/** @type {Set<(url: string) => void>} How each cache that holds stills forgets one */
const caches = new Set();

/**
 * @typedef {Object} Still
 * @property {HTMLImageElement} image
 * @property {boolean} ready - Decoded and drawable
 * @property {boolean} failed
 * @property {number} usedAt - Access counter, for eviction
 */

/**
 * Where a still is read from: its URL, or — once its file was replaced —
 * the same route with one more parameter, which the server ignores.
 * @param {string} url
 * @returns {string}
 */
export function stillAddress(url) {
  const revision = revisions.get(url);
  return revision ? `${url}${url.includes('?') ? '&' : '?'}fresh=${revision}` : url;
}

/**
 * The file behind a URL was replaced or removed: forget its picture in
 * every cache, and read it afresh the next time it is asked for.
 * @param {string} url - As the caches are asked for it
 */
export function dropStill(url) {
  revisions.set(url, `${born}.${++drops}`);
  for (const drop of [...caches]) drop(url);
}

/**
 * Create a cache.
 * @param {() => void} onLoad - Called when a still becomes drawable or
 *   fails, and when one it held was dropped (`dropStill`)
 * @returns {{ get: (url: string) => Still, size: () => number, clear: () => void }}
 */
export function createImageCache(onLoad) {
  /** @type {Map<string, Still>} */
  const stills = new Map();
  let clock = 0;

  /** Drop the least recently used stills beyond the cap. */
  function evict() {
    if (stills.size <= MAX_IMAGES) return;
    const oldest = [...stills.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [url] of oldest.slice(0, stills.size - MAX_IMAGES)) stills.delete(url);
  }

  /** @type {(url: string) => void} Forget one still; its owner is told when it was held. */
  const drop = (url) => void (stills.delete(url) && onLoad());

  return {
    /** The still for a URL, starting its load on first use. */
    get(url) {
      let still = stills.get(url);
      if (!still) {
        const image = new Image();
        still = { image, ready: false, failed: false, usedAt: 0 };
        const entry = still;
        image.decoding = 'async';
        image.onload = () => {
          entry.ready = image.naturalWidth > 0;
          entry.failed = !entry.ready;
          onLoad();
        };
        image.onerror = () => {
          console.warn('[playback] could not load image:', url);
          entry.failed = true;
          onLoad();
        };
        image.src = stillAddress(url);
        stills.set(url, still);
        // Listed for as long as it holds stills: a cache that was cleared is not kept alive.
        caches.add(drop);
        evict();
      }
      still.usedAt = ++clock;
      return still;
    },
    size: () => stills.size,
    clear() {
      stills.clear();
      caches.delete(drop);
    },
  };
}
