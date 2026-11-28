/**
 * Layers — which clips make up the picture at a moment, and in what order.
 * The compositor and its hosts (which have to fetch footage frames before a
 * frame can be drawn) both read the timeline through here, so they cannot
 * disagree about mute, solo, clip kinds or stacking.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § Layer pipeline.
 * @module utils/compose/layers
 */

import { isElementClip } from '#utils/brand/clip.js';
import { clipKind } from '#utils/edl/factory.js';
import { activeTracks, clipsAt, sourceTimeAt } from '#utils/edl/query.js';
import { isBlended } from './blend.js';

/** @typedef {'video'|'image'|'title'|'generator'|'element'} LayerKind */

/**
 * @typedef {Object} Layer
 * @property {any} clip - As stored (keyframes not yet applied)
 * @property {any} track
 * @property {LayerKind} kind
 * @property {number} sourceTime - Seconds into the clip's source at this moment
 */

/** @type {any[]} */
const NONE = [];

/**
 * What a clip on a video track draws, or null for clips that draw nothing
 * (placeholders, audio files). A clip that carries a brand element is an
 * `element`, whatever else it holds.
 * @param {any} clip
 * @param {any} track
 * @returns {LayerKind|null}
 */
export function layerKind(clip, track) {
  if (isElementClip(clip)) return 'element';
  if (clip.generator?.type) return 'generator';
  const kind = clipKind(clip, track);
  return kind === 'video' || kind === 'image' || kind === 'title' ? kind : null;
}

/**
 * The effects of a stack that are switched on.
 * @param {any[]|undefined} effects
 * @returns {any[]}
 */
export function enabledEffects(effects) {
  if (!effects?.length) return NONE;
  return effects.filter((fx) => fx && fx.type && fx.enabled !== false);
}

/**
 * @param {any} track
 * @returns {number} Track opacity, 0..1 (1 when the document has none)
 */
export const trackOpacity = (track) => Math.max(0, Math.min(1, track.opacity ?? 1));

/**
 * @param {any} track
 * @returns {boolean} True when the track's clips must be composed on their
 *   own surface before they join the frame
 */
export function trackNeedsSurface(track) {
  return (
    trackOpacity(track) < 1 ||
    isBlended(track.blendMode) ||
    enabledEffects(track.effects).length > 0
  );
}

/**
 * Video tracks that are seen, **back to front**: the first video track is
 * the front-most layer, so it comes last.
 * @param {{ tracks?: any[] }} edl
 * @returns {any[]}
 */
export function tracksBackToFront(edl) {
  return activeTracks(edl.tracks || [], 'video').reverse();
}

/**
 * The clips of one track that draw at a moment, in start order (two during
 * a cross-fade).
 * @param {any} track
 * @param {number} time - Timeline seconds
 * @returns {Layer[]}
 */
export function trackLayers(track, time) {
  /** @type {Layer[]} */
  const layers = [];
  for (const clip of clipsAt(track, time)) {
    const kind = layerKind(clip, track);
    if (kind) layers.push({ clip, track, kind, sourceTime: sourceTimeAt(clip, time) });
  }
  return layers;
}

/**
 * Every layer of the frame at a moment, back to front. Hosts use it to know
 * which footage frames (`kind: 'video'`, at `sourceTime`) a frame needs.
 * @param {{ tracks?: any[] }} edl
 * @param {number} time - Timeline seconds
 * @returns {Layer[]}
 */
export function layersAt(edl, time) {
  return tracksBackToFront(edl).flatMap((track) => trackLayers(track, time));
}
