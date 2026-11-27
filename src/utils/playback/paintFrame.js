/**
 * Preview painter — the browser host of the shared frame compositor
 * (`#utils/compose`). It gives `drawFrame` what only a browser can provide:
 * scratch canvases, decoded stills, the current frame of each pooled
 * `<video>` element, and fonts that are loaded the first time a title needs
 * them. What is not there yet (a still, a font) is left out of the frame and
 * `onArrive` asks for a repaint once it is.
 * Contract: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module utils/playback/paintFrame
 */

import { drawFrame } from '#utils/compose/drawFrame.js';
import { frameInfo } from '#utils/compose/frame.js';
import { requirements } from '#utils/compose/requirements.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { hasFrame } from '#utils/playback/videoSlot.js';

/** Font checks remembered before the list is started afresh. */
const MAX_FONT_KEYS = 500;

/**
 * On-demand font loading. A font counts as ready once the browser has it —
 * or has given up on it, so a missing file falls back instead of hiding the
 * title for good.
 * @param {() => void} onArrive - Called when a font finished loading
 * @returns {(font: string, text: string) => boolean}
 */
export function createFontLoader(onArrive) {
  /** @type {Set<string>} */
  const settled = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  const settle = (/** @type {string} */ key) => {
    if (settled.size >= MAX_FONT_KEYS) settled.clear();
    settled.add(key);
  };
  return (font, text) => {
    // The size does not decide which files are needed; leave it out of the key.
    const key = `${font.replace(/[\d.]+px/, '')}\n${text}`;
    if (settled.has(key)) return true;
    if (document.fonts.check(font, text)) {
      settle(key);
      return true;
    }
    if (!loading.has(key)) {
      loading.add(key);
      document.fonts
        .load(font, text)
        .catch((err) => console.warn('[playback] could not load font:', font, err.message))
        .finally(() => {
          loading.delete(key);
          settle(key);
          onArrive();
        });
    }
    return false;
  };
}

/**
 * @typedef {Object} PainterSources
 * @property {ReturnType<typeof import('#utils/playback/videoPool.js').createVideoPool>} videos
 * @property {ReturnType<typeof import('#utils/playback/imageCache.js').createImageCache>} images
 * @property {() => void} onArrive - A still or a font became available
 */

/**
 * Bind the compositor to a preview canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {PainterSources} sources
 * @returns {{ paint: (doc: any, time: number) => void }}
 */
export function createPainter(canvas, { videos, images, onArrive }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const fontReady = createFontLoader(onArrive);
  /** @type {import('#utils/compose/host.js').HostEnv} */
  const env = {
    createCanvas: (width, height) =>
      Object.assign(document.createElement('canvas'), { width, height }),
    image(path) {
      const still = images.get(pictureUrl(path));
      return still.ready ? still.image : null;
    },
    frameOf(clip) {
      const slot = videos.find(clip.clipId);
      return slot && hasFrame(slot) ? slot.el : null;
    },
    fontReady,
  };
  /** @type {any} The document whose fonts were last asked for */
  let warmed = null;

  return {
    /**
     * Draw the frame at `time` onto the canvas, at its current size.
     * @param {any} doc - The document
     * @param {number} time - Timeline seconds
     */
    paint(doc, time) {
      if (doc !== warmed) {
        // A new document: start loading every font it uses, not just this frame's.
        warmed = doc;
        for (const { font, text } of requirements(doc).fonts) fontReady(font, text);
      }
      drawFrame(ctx, doc, time, env, frameInfo(doc, canvas.width, canvas.height));
    },
  };
}
