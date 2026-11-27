/**
 * Text animation — where each piece of a title is at a moment of its
 * entrance (`animateIn`, driven by the clip's age) or exit (`animateOut`,
 * driven by the time remaining). A piece is the whole block, a line, a word
 * or a character (`by`); pieces start `stagger` seconds apart and each takes
 * `duration`. The entrance runs first to last; the exit lets the first
 * piece leave first and the last one finish exactly at the clip's end.
 * This module holds the vocabulary and the timing; `animate.js` the motion.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § text.
 * @module utils/compose/text/animation
 */

/** `animateIn.type` / `animateOut.type`. */
export const TEXT_ANIMATIONS = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'scale',
  'blur',
  'typewriter',
];

/** `animateIn.by` / `animateOut.by`. */
export const TEXT_UNITS = ['block', 'line', 'word', 'char'];

/**
 * @typedef {{ type: string, duration: number, by: string, stagger: number, ease: string }} TextAnimation
 */

/**
 * A stored animation with every field usable.
 * @param {any} raw
 * @returns {TextAnimation}
 */
export function textAnimation(raw) {
  const type = TEXT_ANIMATIONS.includes(raw?.type) ? raw.type : 'none';
  const by = TEXT_UNITS.includes(raw?.by) ? raw.by : 'block';
  return {
    type,
    // A typewriter types pieces; typing "the block" would be a plain cut.
    by: type === 'typewriter' && by === 'block' ? 'char' : by,
    duration: raw?.duration >= 0 ? Number(raw.duration) : 0.5,
    stagger: raw?.stagger >= 0 ? Number(raw.stagger) : 0.05,
    ease: typeof raw?.ease === 'string' ? raw.ease : 'ease-out',
  };
}

/**
 * Seconds between pieces.
 * @param {TextAnimation} anim
 * @param {number} count - Pieces
 * @returns {number}
 */
export function gap(anim, count) {
  if (anim.type !== 'typewriter') return anim.by === 'block' ? 0 : anim.stagger;
  return anim.stagger > 0 ? anim.stagger : anim.duration / Math.max(1, count);
}

/**
 * How long an animation takes from its first piece starting to its last
 * piece finishing.
 * @param {TextAnimation} anim
 * @param {number} count - Pieces
 * @returns {number} Seconds; 0 for `none`
 */
export function animationSpan(anim, count) {
  if (anim.type === 'none') return 0;
  if (anim.type === 'typewriter') return gap(anim, count) * count;
  return anim.duration + gap(anim, count) * Math.max(0, count - 1);
}
