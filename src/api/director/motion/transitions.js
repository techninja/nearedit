/**
 * How one background gives way to the next. Backgrounds alternate between
 * two rows and overlap for the length of the transition, so a scene either
 * arrives over the one before it (its own clip fades or wipes on) or is
 * uncovered by it (the clip in front fades or wipes off, inverted, which
 * looks the same). Wipes are the `wipe` effect with keyed `progress`.
 * The look of a scene — an effect preset — is stacked here too.
 * @module api/director/motion/transitions
 */

import { rand } from '#utils/compose/random.js';
import { lookPreset, wipeShape } from '#utils/director/motion/vocab.js';
import { effect } from './clips.js';

/** Directions a straight wipe may travel in, degrees (0 = left to right). */
const WIPE_ANGLES = [0, 180, 20, 160, 90, 270];

/**
 * The parameters of a wipe.
 * @param {string} shape - A shape of the wipe effect
 * @param {number} seed
 * @param {{ width: number, height: number }} frame
 * @returns {Record<string, any>}
 */
function wipeParams(shape, seed, frame) {
  const feather = Math.round(Math.min(frame.width, frame.height) * 0.12);
  if (shape === 'linear') {
    return { shape, feather, angle: WIPE_ANGLES[Math.floor(rand(seed, 5) * WIPE_ANGLES.length)] };
  }
  if (shape === 'iris') return { shape, feather, angle: rand(seed, 5) < 0.5 ? 0 : 45 };
  return { shape, feather };
}

/**
 * @typedef {Object} Change - A transition as one background clip sees it
 * @property {string} kind - A transition name
 * @property {number} frames - Its length
 * @property {number} seed - Shared by both sides, so they agree on the direction
 */

/**
 * The fades, effects and keyframes that carry a background clip's
 * transitions.
 * @param {{ lengthF: number, arrive: Change|null, leave: Change|null,
 *   frame: { width: number, height: number } }} input - `arrive`: this clip
 *   comes on over what was there; `leave`: it comes off what follows
 * @returns {{ fadeInF: number, fadeOutF: number, effects: object[],
 *   keys: Record<string, import('./clips.js').Key[]> }} `keys` are full
 *   keyframe paths, in frames since the clip began
 */
export function changes({ lengthF, arrive, leave, frame }) {
  const out = { fadeInF: 0, fadeOutF: 0, effects: [], keys: {} };
  if (arrive?.frames > 0) {
    const shape = wipeShape(arrive.kind);
    if (!shape) out.fadeInF = arrive.frames;
    else {
      out.effects.push(
        effect('wipeIn', 'wipe', { ...wipeParams(shape, arrive.seed, frame), progress: 1 }),
      );
      out.keys['effects.wipeIn.progress'] = [
        [0, 0, 'ease-in-out'],
        [arrive.frames, 1],
      ];
    }
  }
  if (leave?.frames > 0) {
    const shape = wipeShape(leave.kind);
    if (!shape) out.fadeOutF = leave.frames;
    else {
      const params = { ...wipeParams(shape, leave.seed, frame), progress: 0, invert: true };
      out.effects.push(effect('wipeOut', 'wipe', params));
      out.keys['effects.wipeOut.progress'] = [
        [lengthF - leave.frames, 0, 'ease-in-out'],
        [lengthF, 1],
      ];
    }
  }
  return out;
}

/**
 * The effect stack of a look, and the layer it belongs on: a look made of
 * glow alone needs something to glow, so it goes on the title; every other
 * look grades the background.
 * @param {string} name - An effect preset, or `none`
 * @returns {{ on: 'background'|'title', effects: object[] }}
 */
export function look(name) {
  const preset = lookPreset(name);
  if (!preset) return { on: 'background', effects: [] };
  const effects = preset.effects.map((fx, i) => effect(`look${i + 1}`, fx.type, fx.params));
  const light = preset.effects.every((fx) => fx.type === 'glow');
  return { on: light ? 'title' : 'background', effects };
}
