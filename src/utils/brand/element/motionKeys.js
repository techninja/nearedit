/**
 * Motion for layers that are not text — shapes, pictures, generators —
 * written with what a clip already has: its fades, keyframes on its
 * transform, and the wipe effect with a keyframed progress. No new drawing
 * code: an expanded layer is an ordinary clip. Isomorphic and pure.
 * @module utils/brand/element/motionKeys
 */

import { num } from './measure.js';
import { SLIDE_UNITS } from './vocabulary.js';

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
 * How far a slide travels, output pixels: the design's units, or — `out` —
 * as far as it takes to be outside the frame on that side.
 * @param {Move} move
 * @param {[number, number]} side - Which way the outside lies: [x, y]
 * @param {Box} box
 * @param {{ frame: { width: number, height: number }, unit: number }} env
 * @returns {number}
 */
function travelOf(move, side, box, env) {
  if (move.travel !== 'out') return num(move.travel, SLIDE_UNITS, 0, 400) * env.unit;
  if (side[0]) return side[0] > 0 ? env.frame.width - box.x : box.x + box.w;
  return side[1] > 0 ? env.frame.height - box.y : box.y + box.h;
}

/**
 * The progress values between which a linear wipe crosses a box.
 * @param {number} angle - Degrees
 * @param {number} feather - Output pixels
 * @param {Box} box
 * @param {{ width: number, height: number }} frame
 * @returns {[number, number]} Nothing of the box shown … all of it shown
 */
export function wipeRange(angle, feather, box, frame) {
  const [ux, uy] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const half = (Math.abs(frame.width * ux) + Math.abs(frame.height * uy)) / 2;
  const along = [0, 1].flatMap((i) =>
    [0, 1].map(
      (j) =>
        (box.x + i * box.w - frame.width / 2) * ux + (box.y + j * box.h - frame.height / 2) * uy,
    ),
  );
  const at = (/** @type {number} */ t) => Math.max(0, Math.min(1, t / (half * 2 + feather)));
  return [at(Math.min(...along) + half), at(Math.max(...along) + half + feather)];
}

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
    const length = move.to - move.from;
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
      const params = { shape: 'linear', angle, feather, invert: leaving, progress: leaving ? 0 : 1 };
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
