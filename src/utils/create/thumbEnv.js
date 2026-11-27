/**
 * The compositor host for thumbnails: draws a one-clip document onto a
 * small canvas with the same `drawFrame` the preview and the render use.
 * One host serves every thumbnail (its scratch canvases are pooled); fonts
 * and images load on demand and everyone who drew before they arrived is
 * told to draw again. Browser only.
 * @module utils/create/thumbEnv
 */

import { drawFrame } from '#utils/compose/drawFrame.js';
import { createFontLoader } from '#utils/compose/fontLoader.js';
import { frameInfo } from '#utils/compose/frame.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';

/** @type {Set<() => void>} */
const waiting = new Set();
/** @type {Map<string, HTMLImageElement>} */
const images = new Map();
/** @type {import('#utils/compose/host.js').HostEnv|null} */
let host = null;

/** A font or an image arrived: let every thumbnail draw again. */
function arrived() {
  for (const redraw of waiting) redraw();
}

/**
 * @param {string} path - Media path
 * @returns {HTMLImageElement|null} null until it is decoded
 */
function imageOf(path) {
  let image = images.get(path);
  if (!image) {
    image = new Image();
    image.onload = arrived;
    image.onerror = () => console.warn('[create] could not load image:', path);
    image.src = pictureUrl(path);
    images.set(path, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** @returns {import('#utils/compose/host.js').HostEnv} */
function hostEnv() {
  host ||= {
    createCanvas: (width, height) =>
      Object.assign(document.createElement('canvas'), { width, height }),
    image: imageOf,
    fontReady: createFontLoader(document.fonts, arrived),
  };
  return host;
}

/**
 * Draw a document's frame onto a thumbnail canvas, at the canvas's size.
 * @param {HTMLCanvasElement} canvas
 * @param {any} doc - The document
 * @param {number} time - Timeline seconds
 */
export function drawThumb(canvas, doc, time) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx || !doc?.tracks) return;
  drawFrame(ctx, doc, time, hostEnv(), frameInfo(doc, canvas.width, canvas.height));
}

/**
 * Be told when fonts or images a thumbnail was waiting for have loaded.
 * @param {() => void} redraw
 * @returns {() => void} Stop listening
 */
export function onThumbAssets(redraw) {
  waiting.add(redraw);
  return () => waiting.delete(redraw);
}
