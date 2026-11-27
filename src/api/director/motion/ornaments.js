/**
 * The accents of a motion piece that lie behind the words: a ring growing
 * out of a corner, and a turning star. See `accents.js`.
 * @module api/director/motion/ornaments
 */

/**
 * A thin circle centred on a corner of the picture, growing slowly: a
 * quarter of it shows, clear of the words.
 * @param {import('./accents.js').AccentInput} input
 * @returns {import('./accents.js').Accent}
 */
export function ring({ text, theme, frame: { width, height }, lengthF, drawF, seed }) {
  const short = Math.min(width, height);
  const size = Math.round(short * 0.58);
  const side = text.align === 'left' || seed % 2 ? 1 : -1;
  const up = (seed >> 1) % 2 ? 1 : -1;
  /** @returns {import('./clips.js').Key[]} */
  const grow = () => [
    [0, Math.round(size * 0.8), 'ease-out'],
    [drawF, size, 'sine'],
    [lengthF, Math.round(size * 1.14)],
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
      offsetX: Math.round((side * width) / 2),
      offsetY: Math.round((up * height) / 2),
    },
    keys: { widthPx: grow(), heightPx: grow() },
    opacity: 0.5,
  };
}

/**
 * A many-pointed star in the backdrop's light colour, turning slowly
 * behind the words.
 * @param {import('./accents.js').AccentInput} input
 * @returns {import('./accents.js').Accent}
 */
export function burst({ text, colors, frame: { width, height }, lengthF, drawF, fps, seed }) {
  const size = Math.round(Math.hypot(width, height) * 0.62);
  const turn = (lengthF / fps) * 7 * (seed % 2 ? -1 : 1);
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
