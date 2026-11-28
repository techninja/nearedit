/**
 * Scratch-surface pool. Compositing needs temporary canvases — a surface
 * for a clip with effects, for a track with opacity, for a blurred copy —
 * and allocating a frame-sized canvas costs far more than drawing into one.
 * The pool hands the same canvases out again frame after frame, so drawing
 * allocates nothing once every size in use has been seen. Isomorphic: it
 * only ever calls the host's `createCanvas`.
 * @module utils/compose/pool
 */

/** Frames a free surface may go unused before it is dropped. */
export const MAX_IDLE_FRAMES = 240;

/**
 * @typedef {Object} Surface
 * @property {any} canvas - What `drawImage` takes
 * @property {any} ctx - Its 2D context
 * @property {number} width
 * @property {number} height
 * @property {number} usedAt - Frame it was last handed out in
 * @property {boolean} [read] - Its pixels are read back: made for that
 */

/**
 * Back to a blank, transparent canvas with default drawing state.
 * @param {Surface} surface
 */
function wipe(surface) {
  const { ctx } = surface;
  if (typeof ctx.reset === 'function') return ctx.reset();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, surface.width, surface.height);
}

/**
 * Create a pool.
 * @param {(width: number, height: number) => any} createCanvas - The host's factory
 */
export function createPool(createCanvas) {
  /** @type {Map<string, Surface[]>} Free surfaces by size */
  const free = new Map();
  /** @type {Surface[]} Surfaces lent to the module being run */
  const leased = [];
  let frame = 0;
  let created = 0;
  let size = { width: 1, height: 1 };

  /**
   * A blank surface of exactly this size.
   * @param {number} [width] - Defaults to the frame being drawn
   * @param {number} [height]
   * @param {boolean} [read] - Its pixels will be read back (`getImageData`):
   *   a browser then keeps the canvas where reading costs nothing
   * @returns {Surface}
   */
  function acquire(width = size.width, height = size.height, read = false) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    let surface = free.get(`${w}x${h}${read ? 'r' : ''}`)?.pop();
    if (surface) {
      wipe(surface);
    } else {
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d', read ? { willReadFrequently: true } : undefined);
      surface = { canvas, ctx, width: w, height: h, usedAt: frame, read };
      created++;
    }
    surface.usedAt = frame;
    return surface;
  }

  /** @param {Surface} surface - Give a surface back */
  function release(surface) {
    const key = `${surface.width}x${surface.height}${surface.read ? 'r' : ''}`;
    if (!free.has(key)) free.set(key, []);
    free.get(key).push(surface);
  }

  return {
    acquire,
    release,

    /** Lend a surface to a module; `settle` takes it back. */
    lease(/** @type {number} */ width, /** @type {number} */ height, read = false) {
      const surface = acquire(width, height, read);
      leased.push(surface);
      return surface;
    },

    /** @returns {number} A mark for `settle` */
    mark: () => leased.length,

    /** Take back everything lent since `mark`. */
    settle(/** @type {number} */ mark) {
      while (leased.length > mark) release(leased.pop());
    },

    /** A frame of this size starts. A new size retires the old surfaces. */
    begin(/** @type {number} */ width, /** @type {number} */ height) {
      if (width !== size.width || height !== size.height) free.clear();
      size = { width, height };
      frame++;
    },

    /** A frame ended: drop what has not been used for a long while. */
    end() {
      for (const [key, list] of free) {
        const kept = list.filter((surface) => frame - surface.usedAt <= MAX_IDLE_FRAMES);
        if (kept.length) free.set(key, kept);
        else free.delete(key);
      }
    },

    /** Counters, for tests and diagnostics. */
    stats: () => ({
      created,
      free: [...free.values()].reduce((sum, list) => sum + list.length, 0),
      leased: leased.length,
    }),
  };
}

/** @typedef {ReturnType<typeof createPool>} Pool */
