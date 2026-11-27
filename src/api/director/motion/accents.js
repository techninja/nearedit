/**
 * Accents of a motion piece: one shape per scene that supports the words —
 * a rule drawn under the title, a frame inside the picture's edges, a ring
 * growing behind the text, a turning star. Each is a `shape` generator
 * moved by keyframes. Reference: docs/app-spec/DIRECTOR-MOTION.md § Accents.
 * @module api/director/motion/accents
 */

import { burst, ring } from './ornaments.js';

/**
 * @typedef {Object} AccentInput
 * @property {import('./layout.js').Composition} text - Where the words are
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {[string, string, string]} colors - The scene's backdrop
 * @property {{ width: number, height: number }} frame
 * @property {number} lengthF - Length of the accent's clip, frames
 * @property {number} drawF - Frames its entrance takes
 * @property {number} fps
 * @property {number} seed
 * @typedef {Object} Accent
 * @property {Record<string, any>} params - Parameters of the `shape` generator
 * @property {Record<string, import('./clips.js').Key[]>} keys - Paths below
 *   `generator.params.`, in frames since the clip began
 * @property {number} opacity - `transform.opacity` of the clip
 */

/**
 * A line that draws itself under the title: from its middle when the text
 * is centred, from the margin when it is set left.
 * @param {AccentInput} input
 * @returns {Accent}
 */
function rule({ text, theme, drawF }) {
  const { x, y, width, thickness } = text.rule;
  const params = {
    shape: 'line',
    sizing: 'pixels',
    widthPx: width,
    thickness,
    cap: 'butt',
    fill: theme.accent,
    offsetX: Math.round(text.align === 'left' ? x + width / 2 : x),
    offsetY: Math.round(y),
  };
  /** @type {Accent['keys']} */
  const keys = {
    widthPx: [
      [0, 0, 'ease-out'],
      [drawF, Math.round(width)],
    ],
  };
  if (text.align === 'left') {
    // The left end stays put while the line grows: its middle travels half as far.
    keys.offsetX = [
      [0, Math.round(x), 'ease-out'],
      [drawF, Math.round(x + width / 2)],
    ];
  }
  return { params, keys, opacity: 1 };
}

/**
 * An outline just inside the edges of the picture, settling inward.
 * @param {AccentInput} input
 * @returns {Accent}
 */
function frame({ theme, frame: { width, height }, lengthF, drawF }) {
  const short = Math.min(width, height);
  const inset = short * 0.055;
  const [w, h] = [width - inset * 2, height - inset * 2];
  const grow = short * 0.03;
  return {
    params: {
      shape: 'rectangle',
      sizing: 'pixels',
      filled: false,
      stroke: theme.accent,
      strokeWidth: Math.max(2, Math.round(short * 0.004)),
      widthPx: Math.round(w),
      heightPx: Math.round(h),
    },
    keys: {
      widthPx: [
        [0, Math.round(w + grow), 'ease-out'],
        [drawF, Math.round(w), 'sine'],
        [lengthF, Math.round(w - grow / 2)],
      ],
      heightPx: [
        [0, Math.round(h + grow), 'ease-out'],
        [drawF, Math.round(h), 'sine'],
        [lengthF, Math.round(h - grow / 2)],
      ],
    },
    opacity: 0.7,
  };
}

/** @type {Record<string, (input: AccentInput) => Accent>} */
const RECIPES = { rule, frame, ring, burst };

/**
 * The shape and its move for an accent.
 * @param {string} name - A name of `ACCENTS`
 * @param {AccentInput} input
 * @returns {Accent|null} null for `none` and for names without a recipe
 */
export function accent(name, input) {
  return RECIPES[name] ? RECIPES[name](input) : null;
}
