/**
 * The drums of a score: a style's layers as one-bar parts — the more
 * energy a section has, the more of them play — and the fill: a two-bar
 * part whose first bar leads into a section and whose second is the
 * downbeat it lands on.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/drums
 */

import { partId } from './parts.js';

/** @typedef {import('./style.js').Style} Style */

/**
 * @param {Style} style
 * @returns {{ from: number, part: Record<string, any> }[]} The layers as
 *   parts without `play` ranges, each with the energy it joins at
 */
export function drumLayers(style) {
  return style.drums.map((layer) => ({
    from: layer.from,
    part: {
      id: partId(layer.name),
      name: layer.name,
      kind: 'drums',
      kit: style.kit,
      steps: style.steps,
      bars: 1,
      volume: layer.volume,
      pan: 0,
      reverb: layer.reverb,
      delay: 0,
      lanes: { ...layer.lanes },
    },
  }));
}

/**
 * @param {Style} style
 * @returns {number} The energy at which its first drum layer joins;
 *   Infinity for a style without drums
 */
export function drumsFrom(style) {
  return Math.min(Infinity, ...style.drums.map((layer) => layer.from));
}

/**
 * The fill and the downbeat after it.
 * @param {Style} style
 * @returns {Record<string, any>|null} A two-bar part without `play`
 *   ranges; null for a style that has no fill
 */
export function fillPart(style) {
  const drums = [...new Set([...Object.keys(style.fill), ...Object.keys(style.hit)])];
  if (!drums.length || !style.drums.length) return null;
  const rest = '.'.repeat(style.steps);
  /** @type {Record<string, string>} */
  const lanes = {};
  for (const drum of drums) lanes[drum] = (style.fill[drum] || rest) + (style.hit[drum] || rest);
  // As loud as the layer that carries the beat.
  const beat = style.drums.reduce((a, b) => (b.volume > a.volume ? b : a));
  return {
    id: 'fill',
    name: 'Fill',
    kind: 'drums',
    kit: style.kit,
    steps: style.steps,
    bars: 2,
    volume: beat.volume,
    pan: 0,
    reverb: beat.reverb,
    delay: 0,
    lanes,
  };
}
