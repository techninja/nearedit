/**
 * A text layer as a title clip: the fitted block, its colours, plate,
 * shadow and outline, and its entrance and exit as the compositor's own
 * text animations — spaced so that the whole text has arrived within the
 * time the layer allows, however long it is. Isomorphic and pure.
 * @module utils/brand/element/textClip
 */

import { isHex } from '#utils/compose/color.js';
import { graphemes } from '#utils/compose/text/wrap.js';
import { num } from './measure.js';
import { micro } from './timing.js';
import { STAGGER } from './vocabulary.js';

/** @typedef {import('./timing.js').Move} Move */

/** The compositor's text animation for each motion; a wipe is an effect. */
const ANIMATIONS = {
  ...{ fade: 'fade', scale: 'scale', blur: 'blur', type: 'typewriter' },
  ...{ 'slide-up': 'slide-up', 'slide-down': 'slide-down' },
  ...{ 'slide-left': 'slide-left', 'slide-right': 'slide-right' },
};
const NONE = { type: 'none', by: 'block', duration: 0, stagger: 0, ease: 'linear' };
/** Rounded down, so the pieces together never take longer than they were given. */
const trim = (/** @type {number} */ value) => Math.floor(value * 10000) / 10000;

/**
 * How many pieces an animation moves one by one.
 * @param {string} content - With its line breaks
 * @param {string} by
 * @returns {number}
 */
export function pieceCount(content, by) {
  if (by === 'char') return Math.max(1, graphemes(content).filter((c) => c.trim()).length);
  if (by === 'word') return Math.max(1, content.split(/\s+/).filter(Boolean).length);
  return by === 'line' ? Math.max(1, content.split('\n').filter((l) => l.trim()).length) : 1;
}

/**
 * A text animation that takes a move's whole length from its first piece
 * starting to its last piece settling.
 * @param {Move|null} move
 * @param {string} content
 * @returns {{ type: string, by: string, duration: number, stagger: number, ease: string }}
 */
export function textAnimation(move, content) {
  const type = move && ANIMATIONS[move.motion];
  if (!type) return NONE;
  const seconds = micro(move.to - move.from);
  const count = pieceCount(
    content,
    type === 'typewriter' && move.by === 'block' ? 'char' : move.by,
  );
  if (type === 'typewriter') {
    const by = move.by === 'block' ? 'char' : move.by;
    const step = trim(Math.min(move.stagger ?? STAGGER[by] ?? 0.04, seconds / count));
    return { type, by, duration: step, stagger: step, ease: 'linear' };
  }
  if (move.by === 'block' || count < 2) {
    return { type, by: 'block', duration: trim(seconds), stagger: 0, ease: move.ease };
  }
  // Each piece takes a good half of the time; the rest spaces them out.
  const duration = trim(Math.max(Math.min(0.12, seconds), Math.min(0.6, seconds * 0.55)));
  const room = Math.max(0, seconds - duration) / (count - 1);
  const stagger = trim(Math.min(move.stagger ?? STAGGER[move.by] ?? 0.05, room));
  return { type, by: move.by, duration, stagger, ease: move.ease };
}

/**
 * The alignment of a text layer's lines: its own, its group's, or the side
 * its anchor is on.
 * @param {Record<string, any>} layer
 * @param {Record<string, any>|undefined} group
 * @returns {'left'|'center'|'right'}
 */
function alignOf(layer, group) {
  const named = [layer.align, group?.align].find((a) => ['left', 'center', 'right'].includes(a));
  if (named) return named;
  const anchor = String(layer.at || '');
  return anchor.endsWith('left') ? 'left' : anchor.endsWith('right') ? 'right' : 'center';
}

/**
 * The `text` block of a text layer's clip.
 * @param {Record<string, any>} layer
 * @param {import('./textFit.js').Fitted} fitted
 * @param {import('./timing.js').Timing} timing
 * @param {{ unit: number, group?: Record<string, any> }} env
 * @returns {Record<string, any>}
 */
export function textBlock(layer, fitted, timing, env) {
  const { font, fontSize, content } = fitted;
  const { unit } = env;
  const { plate, shadow, outline } = layer;
  return {
    content,
    fontFamily: font.family,
    weight: font.weight,
    bold: font.weight >= 600,
    italic: font.italic,
    fontSize,
    color: isHex(layer.color) ? layer.color : '#ffffff',
    align: alignOf(layer, env.group),
    lineHeight: font.lineHeight,
    letterSpacing: Math.round(font.tracking * fontSize * 100) / 100,
    maxWidth: 0,
    ...(isHex(plate?.color) && {
      background: plate.color,
      boxPadding: num(plate.pad, 0.3, 0, 5),
      boxRadius: num(plate.radius, 0, 0, 100) * unit,
    }),
    ...(isHex(shadow?.color) && {
      shadowColor: shadow.color,
      shadowBlur: num(shadow.blur, 0, 0, 50) * unit,
      shadowX: num(shadow.x, 0, -50, 50) * unit,
      shadowY: num(shadow.y, 0, -50, 50) * unit,
    }),
    ...(isHex(outline?.color) && {
      outlineColor: outline.color,
      outlineWidth: num(outline.width, 0, 0, 20) * unit,
    }),
    animateIn: textAnimation(timing.enter, content),
    animateOut: textAnimation(timing.exit, content),
  };
}
