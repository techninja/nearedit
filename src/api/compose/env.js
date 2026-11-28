/**
 * The compositor's host environment on the server: canvases from
 * `@napi-rs/canvas` (the same Skia rasteriser Chromium draws with), the
 * bundled fonts, stills the caller has loaded, and footage frames and
 * transcripts the caller supplies. Node only — nothing the browser loads may import this.
 * Contract: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module api/compose/env
 */

import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { registerDocumentFonts, registerFonts } from './fonts.js';

/**
 * @typedef {import('#utils/compose/host.js').HostEnv} HostEnv
 * @typedef {{ get: (path: string) => any }} ImageSource - A `Map` of loaded
 *   stills by media path, or anything with the same `get`
 */

/**
 * Decode stills from disk. **The caller decides which paths may be read** —
 * pass only paths that have been through the server's allow-list
 * (`lib/paths.js`). Each path is read as a local file, never as a URL. A
 * file that cannot be read or decoded is reported and left out; its layer
 * then draws nothing.
 * @param {Iterable<string>} paths - Absolute, allow-listed paths
 * @returns {Promise<Map<string, any>>} Decoded images by path
 */
export async function loadImages(paths) {
  /** @type {Map<string, any>} */
  const images = new Map();
  await Promise.all(
    [...new Set(paths)].map(async (path) => {
      try {
        images.set(path, await loadImage(await readFile(path)));
      } catch (err) {
        console.warn(`[compose] could not load image ${path}: ${err.message}`);
      }
    }),
  );
  return images;
}

/**
 * Create a host environment. Keep it for as long as frames of one size are
 * being drawn: the compositor pools its scratch canvases per environment.
 * @param {Object} [options]
 * @param {ImageSource} [options.images] - Stills by media path (see `loadImages`)
 * @param {(clip: any, sourceTime: number) => any} [options.frameOf] - The
 *   footage frame for a clip at a source time: a canvas or image holding the
 *   decoded frame, or null when there is none
 * @param {(clip: any) => any} [options.words] - The transcript of a
 *   captioned clip's file (a sidecar, its word list, or triples) — the same
 *   object every time — or null when there is none
 * @returns {HostEnv}
 */
export function createEnv({ images, frameOf, words } = {}) {
  registerFonts();
  return {
    createCanvas: (width, height) => createCanvas(width, height),
    image: (path) => images?.get(path) || null,
    frameOf: (clip, sourceTime) => (frameOf ? frameOf(clip, sourceTime) : null),
    fontReady: () => true,
    words: (clip) => (words ? words(clip) : null),
    // A document's own font files: registered the first time its table is seen.
    fonts: (fonts) => void registerDocumentFonts(fonts),
  };
}

/**
 * A canvas that raw decoded footage can be pushed into, to hand to the
 * compositor from `frameOf`.
 * @param {number} width
 * @param {number} height
 * @returns {{ canvas: any, put: (rgba: Uint8Array|Uint8ClampedArray) => any }}
 *   `put` takes `width × height × 4` bytes of RGBA and returns the canvas
 */
export function createFrameSource(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  return {
    canvas,
    put(rgba) {
      image.data.set(rgba);
      ctx.putImageData(image, 0, 0);
      return canvas;
    },
  };
}
