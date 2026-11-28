/**
 * Motion for layers that are not text — shapes, pictures, generators —
 * written with what a clip already has: its fades, keyframes on its
 * transform, and the wipe effect with a keyframed progress. No new drawing
 * code: an expanded layer is an ordinary clip. Isomorphic and pure.
 * @module utils/brand/element/motionKeys
 */

import { num } from './measure.js';
import { travelOf, wipeRange } from './motionGeometry.js';
import { micro } from './timing.js';

/** @typedef {import('./timing.js').Move} Move */
/** @typedef {import('./box.js').Box} Box */

/**
 * @typedef {Object} Rest - The transform of the layer's clip at rest
 * @property {number} x
 * @property {number} y
 * @property {number} scale
 * @property {number} px - Where its content's centre is from the centre of
 *   what is scaled, output pixels (a shape drawn off-centre in a frame-sized
 *   picture; 0 for a picture placed by its own centre)
 * @property {number} py
 * @property {Record<string, number>} [grow] - Instead of the transform's
 *   scale, the properties that grow from nothing to these values when the
 *   layer scales in: a shape's own width, height, corner radius and stroke
 *   (it then stays sharp, and may be larger than the frame)
 */

/**
 * @typedef {Object} Motion - Clip fields that make a layer move
 * @property {Record<string, { t: number, v: number, ease: string }[]>} keyframes
 * @property {any[]} effects
 * @property {number} fadeIn
 * @property {number} fadeOut
 * @property {string} fadeInCurve
 * @property {string} fadeOutCurve
 */

/** Where a slide comes from, as multiples of its travel: [x, y]. */
const FROM = {
  'slide-up': [0, 1],
  'slide-down': [0, -1],
  'slide-left': [1, 0],
  'slide-right': [-1, 0],
};
/** The fade curve nearest to an easing. */
const CURVES = { linear: 'linear', 'ease-in': 'slow', 'ease-out': 'fast', 'back-out': 'fast' };
/** A value is at rest between its entrance and its exit; keys this close are one. */
const SAME = 2e-6;

/**
 * The clip fields that move a layer in and out.
 * @param {import('./timing.js').Timing} timing
 * @param {Rest} rest
 * @param {Box} box - Where the layer is at rest
 * @param {{ frame: { width: number, height: number }, unit: number }} env
 * @returns {Motion}
 */
export function motionOf(timing, rest, box, env) {
  /** @type {Motion} */
  const out = {
    ...{ keyframes: {}, effects: [], fadeIn: 0, fadeOut: 0 },
    ...{ fadeInCurve: 'linear', fadeOutCurve: 'linear' },
  };
  /** @type {(path: string, move: Move, from: number, to: number) => void} */
  const key = (path, move, from, to) => {
    if (Math.abs(from - to) < 1e-9) return;
    const keys = (out.keyframes[path] ||= []);
    const last = keys[keys.length - 1];
    if (last && move.from - last.t < SAME) last.ease = move.ease;
    else keys.push({ t: move.from, v: from, ease: move.ease });
    keys.push({ t: move.to, v: to, ease: 'linear' });
  };
  for (const [move, leaving] of /** @type {[Move|null, boolean][]} */ ([
    [timing.enter, false],
    [timing.exit, true],
  ])) {
    if (!move) continue;
    const length = micro(move.to - move.from);
    const fade = () => {
      out[leaving ? 'fadeOut' : 'fadeIn'] = length;
      out[leaving ? 'fadeOutCurve' : 'fadeInCurve'] = CURVES[move.ease] || 'smooth';
    };
    /** @type {(path: string, away: number, home: number) => void} */
    const between = (path, away, home) =>
      leaving ? key(path, move, home, away) : key(path, move, away, home);
    const slide = FROM[move.motion];
    if (slide) {
      // An exit carries on the way the entrance came: it leaves by the far side.
      const side = /** @type {[number, number]} */ (slide.map((d) => (leaving ? -d : d)));
      const far = travelOf(move, side, box, env);
      if (side[0]) between('transform.x', rest.x + side[0] * far, rest.x);
      else between('transform.y', rest.y + side[1] * far, rest.y);
      if (move.travel !== 'out') fade();
    } else if (move.motion === 'scale' && rest.grow) {
      for (const [path, size] of Object.entries(rest.grow)) between(path, 0, size);
    } else if (move.motion === 'scale') {
      between('transform.scaleX', 0, rest.scale);
      between('transform.scaleY', 0, rest.scale);
      between('transform.x', rest.x + rest.px, rest.x);
      between('transform.y', rest.y + rest.py, rest.y);
    } else if (move.motion === 'wipe') {
      const feather = 1.2 * env.unit;
      const angle = num(move.angle, 0, -360, 360);
      const [hidden, shown] = wipeRange(angle, feather, box, env.frame);
      const effectId = leaving ? 'out' : 'in';
      const params = {
        shape: 'linear',
        angle,
        feather,
        invert: leaving,
        progress: leaving ? 0 : 1,
      };
      out.effects.push({ effectId, type: 'wipe', enabled: true, params });
      const path = `effects.${effectId}.progress`;
      // Outside its motion the wipe is fully open, which costs nothing to draw.
      const [idle, before] = leaving ? [0, move.from - 1e-3] : [1, move.to + 1e-3];
      const sweep = [
        { t: move.from, v: hidden, ease: move.ease },
        { t: move.to, v: shown, ease: 'hold' },
      ];
      const hold = { t: before, v: idle, ease: 'hold' };
      out.keyframes[path] = leaving ? [hold, ...sweep] : [...sweep, hold];
    } else {
      fade();
    }
  }
  return out;
}
