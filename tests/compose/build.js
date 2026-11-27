/**
 * Small builders for the documents the compositor tests draw.
 * @module tests/compose/build
 */

import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';

/** Every test clip runs from 0 to this many seconds unless told otherwise. */
export const LENGTH = 4;

/**
 * @param {string} clipId
 * @param {object} [extra]
 * @returns {any} A clip covering 0..LENGTH
 */
export const clip = (clipId, extra = {}) =>
  createClip({ clipId, timelineStart: 0, timelineEnd: LENGTH, sourceOut: LENGTH, ...extra });

/**
 * @param {string} clipId
 * @param {string} type
 * @param {object} [params]
 * @param {object} [extra]
 * @returns {any} A generator clip
 */
export const gen = (clipId, type, params = {}, extra = {}) =>
  clip(clipId, { generator: { type, seed: 11, params }, ...extra });

/**
 * @param {string} clipId
 * @param {string} content
 * @param {object} [text]
 * @param {object} [extra]
 * @returns {any} A title clip
 */
export const title = (clipId, content, text = {}, extra = {}) =>
  clip(clipId, { text: { content, ...text }, ...extra });

/**
 * @param {string} clipId
 * @param {string} sourceFile - A still (`.png`) or footage (`.mp4`)
 * @param {object} [extra]
 * @returns {any}
 */
export const media = (clipId, sourceFile, extra = {}) => clip(clipId, { sourceFile, ...extra });

/**
 * @param {string} type
 * @param {object} [params]
 * @param {boolean} [enabled=true]
 * @returns {any} An effect
 */
export const fx = (type, params = {}, enabled = true) => ({
  effectId: `fx_${type}`,
  type,
  enabled,
  params,
});

/**
 * A 1920×1080 document. Each entry of `layers` is one video track, front
 * first: an array of clips, or `{ clips, ...track fields }`.
 * @param {any[]} layers
 * @param {object} [extra] - Document fields
 * @returns {any}
 */
export function doc(layers, extra = {}) {
  const tracks = layers.map((layer, i) => {
    const fields = Array.isArray(layer) ? { clips: layer } : layer;
    return createTrack('video', { trackId: `v${i + 1}`, ...fields });
  });
  return createEdl({
    resolution: '1920x1080',
    tracks: [...tracks, createTrack('audio', { trackId: 'a1' })],
    ...extra,
  });
}
