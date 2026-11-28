/**
 * Routing — which renderer draws a stretch of the timeline. Plain footage
 * goes through the FFmpeg filter graph (fast); anything only the shared
 * compositor can draw goes through the canvas path. This module says what
 * needs the compositor and why. Pure, apart from reading `RENDER_ENGINE`.
 * Reference: docs/app-spec/RENDER.md § Two renderers.
 * @module api/render/route
 */

import { isBlended } from '#utils/compose/blend.js';
import { enabledEffects, layerKind, trackOpacity } from '#utils/compose/layers.js';
import { parseColor } from '#utils/compose/color.js';
import { videoFadeOutWindow } from '#utils/edl/levels.js';
import { RenderError } from './errors.js';

/** @typedef {'auto'|'canvas'|'ffmpeg'} EngineChoice */
/** @typedef {'canvas'|'ffmpeg'} Engine */

export const ENGINES = ['auto', 'canvas', 'ffmpeg'];

/** What each reason code means, for messages. */
export const REASONS = {
  generator: 'a generator clip',
  title: 'a title',
  element: 'a brand element',
  effect: 'an effect on a clip',
  blend: 'a blend mode on a clip',
  keyframes: 'keyframes on a visual property',
  'fade-curve': 'a curved fade',
  'track-opacity': 'track opacity below 1',
  'track-effect': 'an effect on a track',
  'track-blend': 'a blend mode on a track',
  background: 'a background colour',
  forced: 'RENDER_ENGINE=canvas',
};

/**
 * The renderer the operator asked for.
 * @param {Record<string, string|undefined>} [env]
 * @returns {EngineChoice}
 * @throws {RenderError} 500 for a value that is none of the three
 */
export function engineChoice(env = process.env) {
  const value = (env.RENDER_ENGINE || 'auto').trim().toLowerCase();
  if (ENGINES.includes(value)) return /** @type {EngineChoice} */ (value);
  throw new RenderError(500, `RENDER_ENGINE must be auto, canvas or ffmpeg, not "${value}"`);
}

const curved = (length, curve) => length > 0 && Boolean(curve) && curve !== 'linear';

/**
 * Why a clip on a video track needs the compositor.
 * @param {any} clip
 * @param {any} track - The track that owns it (cross-fades decide which fades show)
 * @returns {string[]} Reason codes; empty when the filter graph can draw it
 */
export function clipNeeds(clip, track) {
  const kind = layerKind(clip, track);
  if (!kind) return [];
  const needs = [];
  if (kind === 'generator' || kind === 'title' || kind === 'element') needs.push(kind);
  if (enabledEffects(clip.effects).length) needs.push('effect');
  if (isBlended(clip.blendMode)) needs.push('blend');
  // A keyframed volume shapes sound only; every other path changes the picture.
  if (Object.keys(clip.keyframes || {}).some((path) => path !== 'volume')) needs.push('keyframes');
  const fadesOut = videoFadeOutWindow(track, clip) && curved(clip.fadeOut, clip.fadeOutCurve);
  if (curved(clip.fadeIn, clip.fadeInCurve) || fadesOut) needs.push('fade-curve');
  return needs;
}

/**
 * Why everything on a video track needs the compositor.
 * @param {any} track
 * @returns {string[]}
 */
export function trackNeeds(track) {
  const needs = [];
  if (trackOpacity(track) < 1) needs.push('track-opacity');
  if (enabledEffects(track.effects).length) needs.push('track-effect');
  if (isBlended(track.blendMode)) needs.push('track-blend');
  return needs;
}

/**
 * Why every frame of a document needs the compositor.
 * @param {{ background?: string }} edl
 * @param {EngineChoice} [choice]
 * @returns {string[]}
 */
export function documentNeeds(edl, choice = 'auto') {
  const [r, g, b] = parseColor(edl.background);
  return [...(choice === 'canvas' ? ['forced'] : []), ...(r || g || b ? ['background'] : [])];
}

/**
 * Refuse a document the filter graph cannot draw when it was told to.
 * @param {string[]} reasons - Reason codes found anywhere in the rendered range
 * @param {EngineChoice} choice
 * @throws {RenderError} 422 naming what needs the compositor
 */
export function checkEngine(reasons, choice) {
  if (choice !== 'ffmpeg' || !reasons.length) return;
  const what = [...new Set(reasons)].map((code) => REASONS[code] || code).join(', ');
  throw new RenderError(
    422,
    `RENDER_ENGINE=ffmpeg cannot render this timeline: it has ${what}. ` +
      'Set RENDER_ENGINE=auto (the default) to use the compositor where it is needed.',
  );
}
