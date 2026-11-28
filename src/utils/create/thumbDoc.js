/**
 * Documents for thumbnails. A thumbnail in the Create tab is the real
 * thing: a one-clip document drawn by the compositor on a small canvas.
 * This builds those documents — a generator with its defaults or a
 * preset, or a text preset — at the open document's resolution, so every
 * length scales down exactly as it will in the frame. Pure and isomorphic.
 * @module utils/create/thumbDoc
 */

import { updateClip } from '#utils/edl/clipEdit.js';
import { createEdl, parseResolution } from '#utils/edl/factory.js';
import { insertGenerator } from '#utils/edl/generator.js';
import { DEFAULT_DURATION } from './placement.js';
import { addTextPreset } from './addText.js';
import { textPreset } from './textPresets.js';

/** Seed used for thumbnails, so a tile always shows the same picture. */
export const THUMB_SEED = 7;

/**
 * @typedef {Object} ThumbSpec
 * @property {any} doc - A one-clip document
 * @property {number} duration - Length of its clip, seconds
 * @property {number} still - The moment shown while the tile is at rest
 */

/**
 * The empty document a thumbnail starts from.
 * @param {{ resolution?: string, fps?: number }} [like] - The open document
 * @returns {any}
 */
function blank(like = {}) {
  return createEdl({
    resolution: like.resolution || '1920x1080',
    fps: like.fps > 0 ? like.fps : 30,
  });
}

/**
 * @param {{ type: string, params?: Record<string, any>, seed?: number }} item
 * @param {{ resolution?: string, fps?: number }} [like]
 * @returns {ThumbSpec}
 */
export function generatorThumb(item, like) {
  const doc = insertGenerator(
    blank(like),
    { type: item.type, params: item.params, seed: item.seed ?? THUMB_SEED },
    { time: 0, duration: DEFAULT_DURATION },
  );
  // Past the middle: particles have had time to fill the frame.
  return { doc, duration: DEFAULT_DURATION, still: DEFAULT_DURATION * 0.6 };
}

/**
 * A text style's thumbnail is framed closer than the frame it will sit in:
 * the title is drawn in the middle and enlarged, so its look can be read
 * on a small tile. Font, colours, box and animation are the real ones.
 * @param {string} id - A text preset
 * @param {{ resolution?: string, fps?: number }} [like]
 * @returns {ThumbSpec}
 */
export function textThumb(id, like) {
  const preset = textPreset(id);
  const added = addTextPreset(blank(like), id, { time: 0 });
  const close = preset?.close || 1;
  const doc = added.clipId
    ? updateClip(added.edl, added.clipId, {
        transform: { x: 0, y: 0, scaleX: close, scaleY: close },
      })
    : added.edl;
  const duration = preset?.duration || DEFAULT_DURATION;
  // In the middle: after the entrance, before the exit.
  return { doc, duration, still: duration / 2 };
}

/** @type {WeakMap<object, { x: number, y: number, width: number, height: number }>} */
const crops = new WeakMap();

/**
 * Frame a thumbnail closer: show only a part of its document's frame (a
 * brand element sits low in a corner; its tile shows that corner).
 * @param {any} doc - A thumbnail's document
 * @param {{ x: number, y: number, width: number, height: number }} rect - Output
 *   pixels, in the frame's own shape
 * @returns {any} The same document
 */
export function cropThumb(doc, rect) {
  crops.set(doc, rect);
  return doc;
}

/**
 * @param {any} doc
 * @returns {{ x: number, y: number, width: number, height: number }|null} The
 *   part of the frame its thumbnail shows; null for all of it
 */
export const thumbCrop = (doc) => (doc && typeof doc === 'object' && crops.get(doc)) || null;

/**
 * Backing-store size of a thumbnail canvas: the output aspect ratio, as
 * large as fits a box.
 * @param {string} resolution - Output size, `WxH`
 * @param {number} [maxWidth=256]
 * @param {number} [maxHeight=144]
 * @returns {{ width: number, height: number }}
 */
export function thumbSize(resolution, maxWidth = 256, maxHeight = 144) {
  const out = parseResolution(resolution);
  const scale = Math.min(maxWidth / out.width, maxHeight / out.height);
  return {
    width: Math.max(1, Math.round(out.width * scale)),
    height: Math.max(1, Math.round(out.height * scale)),
  };
}
