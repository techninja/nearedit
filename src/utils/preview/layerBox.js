/**
 * The box of a layer in the browser: what the pure geometry cannot know —
 * how big a piece of footage or a still really is, and how wide a title's
 * text runs in its font — is found here. Browser only.
 * @module utils/preview/layerBox
 */

import { setFont } from '#utils/compose/text/draw.js';
import { textStyle } from '#utils/compose/text/style.js';
import { resolveClip } from '#utils/edl/animate.js';
import { parseResolution } from '#utils/edl/factory.js';
import { getMediaItem } from '#utils/media/library.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { clipBox } from './geometry.js';
import { titleRect } from './overlayModel.js';

/** @typedef {import('./geometry.js').Size} Size */

/** @type {Map<string, HTMLImageElement>} Stills being measured, by path */
const stills = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {CanvasRenderingContext2D|null} */
let ruler = null;

/**
 * Be told when a size that was not known yet has been found.
 * @param {() => void} listener
 * @returns {() => void} Stop listening
 */
export function onSizeKnown(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Size of a media file as the library knows it (a sideways video turned upright).
 * @param {string} path
 * @returns {Size|null}
 */
function listedSize(path) {
  const item = getMediaItem(path);
  if (!(item?.width > 0 && item?.height > 0)) return null;
  const sideways = Math.abs(item.rotation || 0) % 180 === 90;
  return sideways
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}

/**
 * Natural size of a still, as the browser decodes it (what the compositor
 * draws); the library's figure stands in until the image has loaded.
 * @param {string} path
 * @returns {Size|null}
 */
function stillSize(path) {
  let image = stills.get(path);
  if (!image) {
    image = new Image();
    image.onload = () => listeners.forEach((listener) => listener());
    image.onerror = () => console.warn('[preview] could not measure image:', path);
    image.src = pictureUrl(path);
    stills.set(path, image);
  }
  if (image.complete && image.naturalWidth > 0) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return listedSize(path);
}

/**
 * A text measure for a title style, as the compositor measures it.
 * @param {any} text - The clip's `text` block
 * @returns {(run: string) => number}
 */
function measureFor(text) {
  ruler ||= document.createElement('canvas').getContext('2d');
  setFont(ruler, textStyle(text));
  return (run) => ruler.measureText(run).width;
}

/**
 * The box of a layer at a moment.
 * @param {any} edl
 * @param {import('#utils/compose/layers.js').Layer} layer
 * @param {number} time - Timeline seconds
 * @param {(clip: any) => Size|null} [footageSize] - Size of the frame a
 *   video clip is showing, when its player knows it
 * @returns {import('./geometry.js').Box|null} null while the size of its
 *   source is unknown
 */
export function layerBox(edl, layer, time, footageSize) {
  const { clip, kind } = layer;
  if (kind === 'title') {
    const { text } = resolveClip(clip, time);
    const rect = titleRect(text, parseResolution(edl.resolution), measureFor(text));
    return clipBox(edl, clip, time, null, rect);
  }
  if (kind === 'generator') return clipBox(edl, clip, time);
  const size =
    kind === 'image'
      ? stillSize(clip.sourceFile)
      : footageSize?.(clip) || listedSize(clip.sourceFile);
  return size ? clipBox(edl, clip, time, size) : null;
}
