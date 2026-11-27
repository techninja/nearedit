/**
 * What the preview overlay shows: which of the selected clips is in the
 * picture at the playhead, its box as CSS, and which handles it offers.
 * Pure and isomorphic.
 * @module utils/preview/overlayModel
 */

import { layoutText } from '#utils/compose/text/layout.js';
import { textStyle } from '#utils/compose/text/style.js';
import { layersAt } from '#utils/compose/layers.js';
import { isAnimated } from '#utils/edl/keyframeQuery.js';

/** @typedef {import('./geometry.js').Box} Box */
/** @typedef {import('./geometry.js').Rect} Rect */
/** @typedef {import('#utils/compose/layers.js').Layer} Layer */

/** Smallest box side, output pixels, so an empty title can still be grabbed. */
const MIN_SIDE = 24;

/**
 * @typedef {Object} OverlayTarget
 * @property {Layer} layer
 * @property {Box} box
 * @property {boolean} locked - On a locked track: shown, not editable
 * @property {boolean} movable - Position and scale are the clip's own
 *   (not driven by ken burns)
 */

/**
 * The text block of a title inside its frame-sized source.
 * @param {any} text - The clip's `text` block, keyframes applied
 * @param {{ width: number, height: number }} out - Output resolution
 * @param {(run: string) => number} measure - Advance width in the text's font
 * @returns {Rect}
 */
export function titleRect(text, out, measure) {
  const { box } = layoutText(textStyle(text), measure);
  const width = Math.max(MIN_SIDE, box.width);
  const height = Math.max(MIN_SIDE, box.height);
  return { x: (out.width - width) / 2, y: (out.height - height) / 2, width, height };
}

/**
 * The selected clip the overlay works on: the front-most selected clip
 * that is in the picture at this moment.
 * @param {{ tracks?: any[] }} edl
 * @param {string[]} selection
 * @param {number} time - Timeline seconds
 * @param {(layer: Layer) => Box|null} boxOf
 * @returns {OverlayTarget|null}
 */
export function overlayTarget(edl, selection, time, boxOf) {
  const chosen = new Set(selection);
  const layer = layersAt(edl, time)
    .reverse()
    .find((entry) => chosen.has(entry.clip.clipId));
  const box = layer ? boxOf(layer) : null;
  if (!layer || !box) return null;
  const kenBurns = layer.clip.transform?.kenBurns?.enabled;
  const keyed = ['x', 'y', 'scaleX', 'scaleY'].every((key) =>
    isAnimated(layer.clip, `transform.${key}`),
  );
  return { layer, box, locked: Boolean(layer.track.locked), movable: !kenBurns || keyed };
}

/** @type {(value: number) => string} */
const pct = (value) => `${Math.round(value * 1e5) / 1e3}%`;

/**
 * A box as CSS for an element inside the frame: position and size in
 * percent of the frame (so it scales with the preview), rotation about
 * its pivot.
 * @param {Box} box
 * @param {{ width: number, height: number }} out
 * @returns {Record<string, string>}
 */
export function boxStyle(box, out) {
  const width = Math.abs(box.width) || 1;
  const height = Math.abs(box.height) || 1;
  const left = Math.min(box.x, box.x + box.width);
  const top = Math.min(box.y, box.y + box.height);
  return {
    left: pct(left / out.width),
    top: pct(top / out.height),
    width: pct(width / out.width),
    height: pct(height / out.height),
    transform: `rotate(${Math.round(box.rotation * 100) / 100}deg)`,
    transformOrigin: `${pct((box.pivot.x - left) / width)} ${pct((box.pivot.y - top) / height)}`,
  };
}

/**
 * A snap guide as CSS: a line across the frame.
 * @param {import('./snap.js').Guide} guide
 * @param {{ width: number, height: number }} out
 * @returns {Record<string, string>}
 */
export function guideStyle(guide, out) {
  return guide.axis === 'x'
    ? { left: pct(guide.at / out.width), top: '0', bottom: '0', width: '1px' }
    : { top: pct(guide.at / out.height), left: '0', right: '0', height: '1px' };
}
