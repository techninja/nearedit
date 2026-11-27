/**
 * Still-image cache for the compositor — decoded once, drawn many times.
 * @module utils/playback/imageCache
 */

/** Stills kept decoded; the least recently drawn are dropped beyond this. */
const MAX_IMAGES = 24;

/**
 * @typedef {Object} Still
 * @property {HTMLImageElement} image
 * @property {boolean} ready - Decoded and drawable
 * @property {boolean} failed
 * @property {number} usedAt - Access counter, for eviction
 */

/**
 * Create a cache.
 * @param {() => void} onLoad - Called when a still becomes drawable or fails
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
        image.src = url;
        stills.set(url, still);
        evict();
      }
      still.usedAt = ++clock;
      return still;
    },
    size: () => stills.size,
    clear: () => stills.clear(),
  };
}
