/**
 * The compositor host of one renderer: a single environment (and with it a
 * single scratch-surface pool), the output canvas, the stills that are
 * loaded, the footage frame each clip currently shows and the transcripts
 * captions are drawn from. One host serves
 * many segments in a row, so canvases are allocated once.
 *
 * Importing the Node host before any canvas exists matters: it selects the
 * text renderer that matches the browser preview.
 * @module api/render/canvas/host
 */

import { createCanvas, createEnv, createFrameSource, loadImages } from '../../compose/index.js';
import { wordsFrom } from '../words.js';
import { openDecoder } from './pipes.js';

/**
 * @typedef {ReturnType<typeof createFrameSource>} FrameSource
 * @typedef {ReturnType<typeof createCanvasHost>} CanvasHost
 */

/**
 * Create a host. **Every path given to `load` must already have passed the
 * caller's allow-list** — the host reads whatever it is asked to.
 */
export function createCanvasHost() {
  /** @type {Map<string, any>} Stills by path */
  const images = new Map();
  /** @type {Map<string, string>} The size each still was loaded for */
  const sizes = new Map();
  /** @type {Map<string, any>} The frame each footage clip shows, by clip id */
  const frames = new Map();
  /** @type {Map<string, FrameSource[]>} Idle frame sources by size */
  const idle = new Map();
  /** @type {any} */
  let canvas = null;
  /** @type {(clip: any) => any} The transcript of a captioned clip's file */
  let words = wordsFrom(undefined);
  const env = createEnv({
    images,
    frameOf: (clip) => frames.get(clip.clipId) || null,
    words: (clip) => words(clip),
  });

  return {
    env,
    frames,
    /**
     * Hand over the transcripts of the job (`prepareRender`), before a frame is drawn.
     * @param {import('../words.js').WordTable} [table]
     */
    useWords(table) {
      words = wordsFrom(table);
    },
    /**
     * The canvas frames are drawn on.
     * @param {number} width
     * @param {number} height
     * @returns {any}
     */
    canvas(width, height) {
      if (canvas?.width !== width || canvas?.height !== height)
        canvas = createCanvas(width, height);
      return canvas;
    },
    /**
     * Make exactly these stills available: load the missing ones, drop the
     * rest. A still that is shown smaller than it is comes reduced from
     * FFmpeg (`reduced`); every other one is decoded by the canvas library.
     * @param {string[]} paths - Allow-listed, absolute
     * @param {import('./plan.js').Still[]} [reduced]
     * @throws {Error} Naming the first file that cannot be decoded
     */
    async load(paths, reduced = []) {
      const sized = new Map(reduced.map((still) => [still.file, still]));
      const key = (path) => `${sized.get(path)?.width || 0}x${sized.get(path)?.height || 0}`;
      for (const path of [...images.keys()])
        if (!paths.includes(path) || sizes.get(path) !== key(path)) images.delete(path);
      const missing = paths.filter((path) => !images.has(path));
      const plain = missing.filter((path) => !sized.has(path));
      for (const [path, image] of await loadImages(plain)) images.set(path, image);
      for (const path of missing.filter((name) => sized.has(name))) {
        const still = sized.get(path);
        const decoder = openDecoder(still);
        const pixels = await decoder.next();
        decoder.close();
        if (pixels) images.set(path, createFrameSource(still.width, still.height).put(pixels));
      }
      const failed = paths.find((path) => !images.has(path));
      if (failed) throw new Error(`Cannot read image: ${failed}`);
      for (const path of paths) sizes.set(path, key(path));
    },
    /**
     * A canvas that raw footage frames of this size can be pushed into.
     * @param {number} width
     * @param {number} height
     * @returns {FrameSource}
     */
    frameSource(width, height) {
      return idle.get(`${width}x${height}`)?.pop() || createFrameSource(width, height);
    },
    /**
     * Hand a frame source back for the next clip of the same size.
     * @param {FrameSource} source
     */
    release(source) {
      const key = `${source.canvas.width}x${source.canvas.height}`;
      const list = idle.get(key) || [];
      // Sizes come and go with the clips; a couple of spares per size is plenty.
      if (list.length < 2) idle.set(key, [...list, source]);
    },
  };
}
