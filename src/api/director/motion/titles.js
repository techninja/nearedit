/**
 * The words of a scene as title clips: the fitted text block, the theme's
 * colours, and an entrance whose pieces are spaced so that the whole text
 * has arrived within the time the scene allows, however long it is.
 * @module api/director/motion/titles
 */

import { wordCount } from './timing.js';

/**
 * @typedef {import('./layout.js').Placed} Placed
 * @typedef {import('#utils/director/motion/themes.js').Theme} Theme
 */

/** Longest wait between two pieces of an entrance, seconds. */
const STAGGER = { char: 0.06, word: 0.12, line: 0.2 };

/**
 * Pieces an animation moves one by one.
 * @param {string} content
 * @param {string} by - block | line | word | char
 * @param {number} lines - Lines of the fitted block
 * @returns {number}
 */
export function pieceCount(content, by, lines) {
  if (by === 'char') return Math.max(1, [...content.replace(/\s+/g, '')].length);
  if (by === 'word') return Math.max(1, wordCount(content));
  return by === 'line' ? Math.max(1, lines) : 1;
}

/**
 * An `animateIn` block that takes `seconds` from the first piece starting
 * to the last piece settling.
 * @param {string} type - A text animation
 * @param {string} by
 * @param {number} count - Pieces
 * @param {number} seconds
 * @returns {{ type: string, by: string, duration: number, stagger: number, ease: string }}
 */
export function entrance(type, by, count, seconds) {
  const round = (/** @type {number} */ value) => Math.round(value * 1000) / 1000;
  if (type === 'none') return { type, by: 'block', duration: 0, stagger: 0, ease: 'linear' };
  if (type === 'typewriter') {
    const unit = by === 'block' ? 'char' : by;
    const step = Math.min(STAGGER[unit] || 0.06, seconds / count);
    return { type, by: unit, duration: round(step), stagger: round(step), ease: 'linear' };
  }
  const ease = type === 'scale' ? 'back-out' : 'ease-out';
  if (by === 'block' || count < 2) return { type, by, duration: round(seconds), stagger: 0, ease };
  const duration = Math.max(0.2, Math.min(0.7, seconds * 0.55));
  const stagger = Math.min(STAGGER[by] || 0.06, Math.max(0, seconds - duration) / (count - 1));
  return { type, by, duration: round(duration), stagger: round(stagger), ease };
}

/**
 * Seconds an entrance takes in all (COMPOSITOR.md § Text animation).
 * @param {{ type: string, duration: number, stagger: number }} anim
 * @param {number} count
 * @returns {number}
 */
export function entranceSpan(anim, count) {
  if (anim.type === 'none') return 0;
  if (anim.type === 'typewriter') return anim.stagger * count;
  return anim.duration + anim.stagger * Math.max(0, count - 1);
}

/**
 * The `text` block and `transform` of a title clip.
 * @param {string} content
 * @param {Placed} placed
 * @param {{ color: string, shadow: string, animateIn: object, outSeconds: number }} look -
 *   `shadow` is a colour, or '' for none; `outSeconds` 0 leaves the text up to the cut
 * @returns {{ text: object, transform: object, label: string, intent: string }}
 */
export function titleFields(content, placed, look) {
  const size = placed.fitted.fontSize;
  const shadow = look.shadow
    ? {
        shadowColor: look.shadow,
        shadowBlur: Math.round(size * 0.16),
        shadowY: Math.round(size * 0.03),
      }
    : {};
  return {
    text: {
      ...placed.fitted.text,
      content,
      color: look.color,
      ...shadow,
      animateIn: look.animateIn,
      animateOut:
        look.outSeconds > 0
          ? { type: 'fade', by: 'block', duration: look.outSeconds, stagger: 0, ease: 'ease-in' }
          : { type: 'none' },
    },
    transform: { x: Math.round(placed.x), y: Math.round(placed.y) },
    label: content.replace(/\s+/g, ' ').slice(0, 48),
    intent: 'title',
  };
}
