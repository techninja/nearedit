/**
 * Preview surface — owns the preview canvas for `<video-preview>`: sizes it
 * to its container at the output aspect ratio, follows container resizes
 * and device-pixel-ratio changes, and forwards frames to the compositor.
 * @module utils/playback/previewSurface
 */

import { parseResolution } from '#utils/edl/factory.js';
import { createCompositor } from '#utils/playback/compositor.js';
import { fitPreview } from '#utils/playback/previewSize.js';

/**
 * Call back when the device pixel ratio changes (browser zoom, or the
 * window moving to a screen of another density).
 * @param {() => void} onChange
 * @returns {() => void} Stop watching
 */
function watchPixelRatio(onChange) {
  /** @type {MediaQueryList|null} */
  let query = null;
  const handle = () => {
    onChange();
    listen();
  };
  const listen = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', handle, { once: true });
  };
  listen();
  return () => query?.removeEventListener('change', handle);
}

/**
 * @typedef {import('#utils/playback/compositor.js').FrameDoc} FrameDoc
 * @typedef {ReturnType<typeof createPreviewSurface>} PreviewSurface
 */

/**
 * Bind a canvas to its container.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} box - The element whose size the frame is fitted into
 */
export function createPreviewSurface(canvas, box) {
  const compositor = createCompositor(canvas);
  let resolution = '';
  /** @type {{ doc: FrameDoc, time: number }|null} What is on screen while paused */
  let shown = null;

  /** Fit the canvas; a new backing-store size clears it, so repaint. */
  function fit() {
    const out = parseResolution(resolution);
    const boxHeight = box.clientHeight || (box.clientWidth * out.height) / out.width;
    const ratio = window.devicePixelRatio || 1;
    const size = fitPreview(box.clientWidth, boxHeight, out.width, out.height, ratio);
    canvas.style.width = `${size.cssWidth}px`;
    canvas.style.height = `${size.cssHeight}px`;
    if (canvas.width === size.width && canvas.height === size.height) return;
    canvas.width = size.width;
    canvas.height = size.height;
    compositor.invalidate();
    if (shown) compositor.scrub(shown.doc, shown.time);
  }

  /** @param {FrameDoc} doc */
  function follow(doc) {
    if (doc.resolution === resolution) return;
    resolution = doc.resolution;
    fit();
  }

  const observer = new ResizeObserver(fit);
  observer.observe(box);
  const stopWatching = watchPixelRatio(fit);

  return {
    compositor,

    /** Paused: show the frame at `time` (scrub). */
    show(/** @type {FrameDoc} */ doc, /** @type {number} */ time) {
      shown = { doc, time };
      follow(doc);
      compositor.scrub(doc, time);
    },

    /** Playing: paint the frame the transport clock points at. */
    play(/** @type {FrameDoc} */ doc, /** @type {number} */ time) {
      shown = null;
      follow(doc);
      compositor.renderPlaying(doc, time);
    },

    /** Stop observing and release every media element. */
    destroy() {
      observer.disconnect();
      stopWatching();
      compositor.destroy();
      shown = null;
    },
  };
}
