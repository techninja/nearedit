/**
 * The compositor host for thumbnails: draws a one-clip document onto a
 * small canvas with the same `drawFrame` the preview and the render use.
 * One host serves every thumbnail (its scratch canvases are pooled); fonts
 * — the bundled ones and a document's own files — and images load on
 * demand and everyone who drew before they arrived is told to draw again.
 * A thumbnail that is framed closer (`cropThumb`) is drawn larger off
 * screen and its part copied, so it stays sharp. Browser only.
 * @module utils/create/thumbEnv
 */

import { drawFrame } from '#utils/compose/drawFrame.js';
import { createFontLoader } from '#utils/compose/fontLoader.js';
import { createFontRegistrar } from '#utils/compose/fontRegistrar.js';
import { frameInfo } from '#utils/compose/frame.js';
import { parseResolution } from '#utils/edl/factory.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { thumbCrop } from './thumbDoc.js';

/** @type {Set<() => void>} */
const waiting = new Set();
/** @type {Map<string, HTMLImageElement>} */
const images = new Map();
/** @type {import('#utils/compose/host.js').HostEnv|null} */
let host = null;
/** @type {HTMLCanvasElement|null} The off-screen frame of a thumbnail that is framed closer */
let large = null;
/** Goes up when the pictures are to be read afresh; part of their addresses. */
let version = 0;

/** A font or an image arrived: let every thumbnail draw again. */
function arrived() {
  for (const redraw of waiting) redraw();
}

/**
 * Where a file is read from: the media route, or — for a file somebody has
 * just chosen and not yet saved — the address the browser gave it.
 * @param {string} path - A media path, or a `blob:` address
 * @returns {string}
 */
export const fileUrl = (path) =>
  /^blob:/.test(path) ? path : `${pictureUrl(path)}${version ? `&v=${version}` : ''}`;

/**
 * Read every picture again from now on: a file may have been replaced
 * under the name it had (a kit's logo), which nothing else would notice.
 */
export function refreshThumbFiles() {
  version += 1;
  images.clear();
  arrived();
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
    image.src = fileUrl(path);
    images.set(path, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** @returns {import('#utils/compose/host.js').HostEnv} */
function hostEnv() {
  if (host) return host;
  let fontReady = createFontLoader(document.fonts, arrived);
  // New faces: what was known about ready fonts is asked anew.
  const ownFonts = createFontRegistrar(
    document.fonts,
    (family, source, descriptors) => new globalThis.FontFace(family, source, descriptors),
    fileUrl,
    () => void (fontReady = createFontLoader(document.fonts, arrived)),
  );
  host = {
    createCanvas: (width, height) =>
      Object.assign(document.createElement('canvas'), { width, height }),
    image: imageOf,
    fontReady: (font, text) => fontReady(font, text),
    fonts: ownFonts,
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
  const crop = thumbCrop(doc);
  if (!crop) {
    drawFrame(ctx, doc, time, hostEnv(), frameInfo(doc, canvas.width, canvas.height));
    return;
  }
  // Framed closer: the whole frame at the size the part needs, then that part.
  const out = parseResolution(doc.resolution);
  const k = Math.min(4, canvas.width / crop.width);
  large ||= document.createElement('canvas');
  const [width, height] = [Math.round(out.width * k), Math.round(out.height * k)];
  if (large.width !== width || large.height !== height) Object.assign(large, { width, height });
  const frame = large.getContext('2d', { alpha: false });
  drawFrame(frame, doc, time, hostEnv(), frameInfo(doc, width, height));
  const part = [crop.x * k, crop.y * k, crop.width * k, crop.height * k];
  ctx.drawImage(large, part[0], part[1], part[2], part[3], 0, 0, canvas.width, canvas.height);
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
