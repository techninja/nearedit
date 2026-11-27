/**
 * Text animation, the motion — where each piece of a title is at a moment
 * of its entrance or exit: how opaque, how far from its place, how big, how
 * blurred. Timing and vocabulary are in `animation.js`.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § text.
 * @module utils/compose/text/animate
 */

import { ease } from '#utils/edl/easing.js';
import { animationSpan, gap } from './animation.js';

/**
 * @typedef {import('./animation.js').TextAnimation} TextAnimation
 * @typedef {{ alpha: number, dx: number, dy: number, scale: number, blur: number }} UnitState
 */

/** @type {UnitState} A piece at rest. */
export const REST = Object.freeze({ alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0 });

const clamp01 = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
/** Where a slide comes from, as multiples of its travel: [x, y]. */
const SLIDES = {
  'slide-up': [0, 1],
  'slide-down': [0, -1],
  'slide-left': [1, 0],
  'slide-right': [-1, 0],
};

/**
 * State of one piece from one animation.
 * @param {TextAnimation} anim
 * @param {number} clock - Seconds since this piece's animation began
 * @param {boolean} leaving - Exit (true) or entrance
 * @param {number} size - Font size: slides travel one font size, blurs start at a quarter
 * @returns {UnitState}
 */
function pieceState(anim, clock, leaving, size) {
  if (anim.type === 'typewriter') return clock >= -1e-6 ? REST : { ...REST, alpha: 0 };
  // Snap the ends, so a piece is exactly at rest on its last frame.
  const raw = anim.duration > 0 ? clock / anim.duration : clock >= 0 ? 1 : 0;
  const progress = raw > 1 - 1e-9 ? 1 : raw < 1e-9 ? 0 : raw;
  // `e` is how present the piece is: 0 away, 1 at rest (easing may overshoot).
  const e = leaving ? 1 - ease(anim.ease, 1 - progress) : ease(anim.ease, progress);
  if (e === 1) return REST;
  const state = { ...REST, alpha: clamp01(e) };
  const slide = SLIDES[anim.type];
  if (slide) {
    const away = (1 - e) * size * (leaving ? -1 : 1);
    state.dx = slide[0] * away;
    state.dy = slide[1] * away;
  } else if (anim.type === 'scale') {
    state.scale = Math.max(0, e);
  } else if (anim.type === 'blur') {
    state.blur = (1 - clamp01(e)) * size * 0.25;
  }
  return state;
}

/**
 * State of piece `index` of `count` with both animations applied.
 * @param {{ animateIn: TextAnimation, animateOut: TextAnimation, fontSize: number }} style
 * @param {number} index
 * @param {number} count
 * @param {{ age: number, remaining: number }} time
 * @returns {UnitState}
 */
export function unitState(style, index, count, time) {
  const { animateIn: a, animateOut: b, fontSize } = style;
  // A typewriter shows piece i once i + 1 intervals have passed, and erases
  // from the end; every other exit lets the first piece go first.
  const typed = (/** @type {TextAnimation} */ anim) => anim.type === 'typewriter';
  const since = time.age - (typed(a) ? index + 1 : index) * gap(a, count);
  const until = time.remaining - (typed(b) ? index + 1 : count - 1 - index) * gap(b, count);
  const into = a.type === 'none' ? REST : pieceState(a, since, false, fontSize);
  const out = b.type === 'none' ? REST : pieceState(b, until, true, fontSize);
  if (out === REST) return into;
  if (into === REST) return out;
  return {
    alpha: into.alpha * out.alpha,
    dx: into.dx + out.dx,
    dy: into.dy + out.dy,
    scale: into.scale * out.scale,
    blur: into.blur + out.blur,
  };
}

/** @type {TextAnimation} */
const NONE = { type: 'none', duration: 0, by: 'block', stagger: 0, ease: 'linear' };

/**
 * The pieces of a title that are in motion at a moment. While both the
 * entrance and the exit run (a very short clip) the entrance decides what a
 * piece is.
 * @param {{ animateIn: TextAnimation, animateOut: TextAnimation, fontSize: number }} style
 * @param {{ age: number, remaining: number }} time
 * @param {(by: string) => number} countOf - Pieces the title has for a unit
 * @returns {{ by: string, states: UnitState[] } | null} null while everything is at rest
 */
export function animateText(style, time, countOf) {
  const { animateIn: a, animateOut: b } = style;
  const entering = time.age < animationSpan(a, countOf(a.by));
  const leaving = time.remaining < animationSpan(b, countOf(b.by));
  if (!entering && !leaving) return null;
  const by = entering ? a.by : b.by;
  const count = countOf(by);
  const active = { ...style, animateIn: entering ? a : NONE, animateOut: leaving ? b : NONE };
  return { by, states: Array.from({ length: count }, (_, i) => unitState(active, i, count, time)) };
}
