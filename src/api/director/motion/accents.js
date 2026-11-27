/**
 * Accents of a motion piece: one shape per scene that supports the words —
 * a rule drawn under the title, a frame inside the picture's edges, a ring
 * growing behind the text, a turning star. Each is a `shape` generator
 * moved by keyframes. Reference: docs/app-spec/DIRECTOR-MOTION.md § Accents.
 * @module api/director/motion/accents
 */

/**
 * @typedef {Object} AccentInput
 * @property {import('./layout.js').Composition} text - Where the words are
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {[string, string, string]} colors - The scene's backdrop
 * @property {{ width: number, height: number }} frame
 * @property {number} lengthF - Length of the accent's clip, frames
 * @property {number} drawF - Frames its entrance takes
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

/**
 * A thin circle, larger than the words and off to one corner, that keeps
 * growing: part of it always lies outside the picture.
 * @param {AccentInput} input
 * @returns {Accent}
 */
function ring({ text, theme, frame: { width, height }, lengthF, drawF, seed }) {
  const short = Math.min(width, height);
  const size = Math.round(short * 0.8);
  const side = text.align === 'left' || seed % 2 ? 1 : -1;
  const up = (seed >> 1) % 2 ? 1 : -1;
  /** @returns {import('./clips.js').Key[]} */
  const grow = () => [
    [0, Math.round(size * 0.75), 'ease-out'],
    [drawF, size, 'sine'],
    [lengthF, Math.round(size * 1.15)],
  ];
  return {
    params: {
      shape: 'ellipse',
      sizing: 'pixels',
      filled: false,
      stroke: theme.accent,
      strokeWidth: Math.max(2, Math.round(short * 0.005)),
      widthPx: size,
      heightPx: size,
      offsetX: Math.round(side * width * 0.3),
      offsetY: Math.round(up * height * 0.3),
    },
    keys: { widthPx: grow(), heightPx: grow() },
    opacity: 0.45,
  };
}

/**
 * A many-pointed star in the backdrop's light colour, turning slowly
 * behind the words.
 * @param {AccentInput} input
 * @returns {Accent}
 */
function burst({ text, colors, frame: { width, height }, lengthF, drawF, seed }) {
  const size = Math.round(Math.hypot(width, height) * 0.62);
  const turn = (lengthF / 30) * 7 * (seed % 2 ? -1 : 1);
  return {
    params: {
      shape: 'star',
      sizing: 'pixels',
      points: 14,
      inner: 0.72,
      fill: colors[2],
      widthPx: size,
      heightPx: size,
      offsetX: Math.round(text.group.x),
      offsetY: Math.round(text.group.y),
    },
    keys: {
      widthPx: [
        [0, Math.round(size * 0.5), 'back-out'],
        [drawF, size],
      ],
      heightPx: [
        [0, Math.round(size * 0.5), 'back-out'],
        [drawF, size],
      ],
      rotation: [
        [0, 0],
        [lengthF, Math.round(turn)],
      ],
    },
    opacity: 0.55,
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
