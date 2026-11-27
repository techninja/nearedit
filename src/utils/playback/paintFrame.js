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
import { createFontLoader } from '#utils/compose/fontLoader.js';
import { frameInfo } from '#utils/compose/frame.js';
import { requirements } from '#utils/compose/requirements.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { hasFrame } from '#utils/playback/videoSlot.js';

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
  const fontReady = createFontLoader(document.fonts, onArrive);
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
