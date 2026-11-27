/**
 * Sprite cache — the canvases particle layers draw from (a shape at a
 * pixel size, a scaled-down copy of an image, a sheet of tinted copies),
 * kept per host environment so they are made once and not once per frame.
 * Every entry is a pure function of its key, so the cache changes how fast
 * a frame is drawn and never what it shows. The least recently used
 * entries are dropped when the cache holds more pixels or more canvases
 * than its limits. Isomorphic.
 * @module utils/compose/generators/particles/spriteCache
 */

/** Pixels the cache may hold per environment (4 bytes each). */
export const MAX_PIXELS = 16e6;
/** Canvases the cache may hold per environment. */
export const MAX_ENTRIES = 256;

/**
 * @typedef {Object} Sprite
 * @property {any} canvas - Something `drawImage` takes
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} SpriteCache
 * @property {<T extends Sprite>(key: string, build: () => T) => T} get - The
 *   entry for a key, built on first use
 * @property {(width: number, height: number) => any} createCanvas
 * @property {() => { entries: number, pixels: number }} stats
 */

/** @type {WeakMap<object, SpriteCache>} */
const caches = new WeakMap();
/** @type {WeakMap<object, number>} */
const ids = new WeakMap();
let nextId = 1;

/**
 * A short name for an image object, the same for as long as it lives.
 * @param {object} image
 * @returns {number}
 */
export function idOf(image) {
  if (!ids.has(image)) ids.set(image, nextId++);
  return ids.get(image);
}

/**
 * @param {(width: number, height: number) => any} createCanvas
 * @returns {SpriteCache}
 */
function createCache(createCanvas) {
  /** @type {Map<string, { value: any, pixels: number }>} In order of last use */
  const entries = new Map();
  let total = 0;
  return {
    createCanvas,
    get(key, build) {
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }
      const value = build();
      const pixels = value.width * value.height;
      entries.set(key, { value, pixels });
      total += pixels;
      for (const [old, entry] of entries) {
        if (entries.size <= MAX_ENTRIES && total <= MAX_PIXELS) break;
        if (old === key) break;
        entries.delete(old);
        total -= entry.pixels;
      }
      return value;
    },
    stats: () => ({ entries: entries.size, pixels: total }),
  };
}

/**
 * The sprite cache of a host environment.
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {SpriteCache}
 */
export function cacheFor(env) {
  let cache = caches.get(env);
  if (!cache) {
    cache = createCache((width, height) => env.createCanvas(width, height));
    caches.set(env, cache);
  }
  return cache;
}
