/**
 * Where the words of a scene go: the title and the subtitle are fitted to
 * the frame — whatever its shape — and stacked as one group, centred or
 * set against the left margin. All positions are output pixels from the
 * centre of the frame, the unit of `transform.x` / `transform.y`.
 * @module api/director/motion/layout
 */

import { fitText } from './typeset.js';

/**
 * @typedef {import('./typeset.js').Fitted} Fitted
 * @typedef {{ width: number, height: number }} Frame
 * @typedef {'center'|'left'} Align
 * @typedef {{ fitted: Fitted, x: number, y: number }} Placed - A block and
 *   the offset of its centre from the centre of the frame
 * @typedef {Object} Composition
 * @property {Align} align
 * @property {Placed} title
 * @property {Placed|null} subtitle
 * @property {{ x: number, y: number, width: number, height: number }} group -
 *   Centre and size of everything written
 * @property {{ x: number, y: number, width: number, thickness: number }} rule -
 *   Where a rule belongs: between the two blocks, or under a lone title.
 *   `x` is its centre (centred layouts) or its left end (left layouts)
 * @property {boolean} fits - False when the text is too long to fit readably
 */

/** Share of the width kept free on each side of the text. */
export const MARGIN = 0.08;
/** The same inside a `frame` accent, which takes the outer 5.5% for itself. */
export const FRAMED_MARGIN = 0.115;

/**
 * Long titles are set smaller than short ones, as a designer would.
 * @param {string} text
 * @returns {number} 0.6..1
 */
const lengthFactor = (text) => Math.max(0.66, Math.min(1, 1.12 - 0.009 * text.length));

/**
 * Lay out a scene's words.
 * @param {{ title: string, subtitle?: string }} scene
 * @param {import('#utils/director/motion/themes.js').Theme} theme
 * @param {Frame} frame - Output resolution
 * @param {Align} align
 * @param {import('./measure.js').Measure} measure
 * @param {string} [accent] - The scene's accent: a `rule` needs room
 *   between title and subtitle, a `frame` a wider margin
 * @returns {Composition}
 */
export function composeScene(scene, theme, frame, align, measure, accent = 'none') {
  const { width: W, height: H } = frame;
  const short = Math.min(W, H);
  const tall = H > W * 1.2;
  const wide = W > H * 1.2;
  const ruled = accent === 'rule';
  const margin = accent === 'frame' ? FRAMED_MARGIN : MARGIN;
  const budget = W * (align === 'left' && wide ? 0.62 : 1 - margin * 2);
  const lines = tall ? 4 : 3;
  const title = fitText(
    scene.title,
    theme.title,
    {
      width: budget,
      height: H * (tall ? 0.4 : 0.46),
      lines,
      size: theme.title.size * short * lengthFactor(scene.title),
      min: short * 0.05,
    },
    measure,
    align,
  );
  const subtitle = scene.subtitle
    ? fitText(
        scene.subtitle,
        theme.subtitle,
        {
          width: budget,
          height: H * 0.22,
          lines,
          size: Math.min(theme.subtitle.size * short * (tall ? 1.15 : 1), title.fontSize * 0.62),
          min: short * 0.026,
        },
        measure,
        align,
      )
    : null;
  const gap = subtitle ? subtitle.fontSize * (ruled ? 1.25 : 0.55) : 0;
  const height = title.height + (subtitle ? gap + subtitle.height : 0);
  const width = Math.max(title.width, subtitle?.width || 0);
  const centreY = -H * 0.012;
  const top = centreY - height / 2;
  const left = -W / 2 + W * margin;
  const xOf = (/** @type {Fitted} */ block) => (align === 'left' ? left + block.width / 2 : 0);
  const thickness = Math.max(3, Math.round(short * 0.0055));
  return {
    align,
    title: { fitted: title, x: xOf(title), y: top + title.height / 2 },
    subtitle: subtitle && {
      fitted: subtitle,
      x: xOf(subtitle),
      y: top + height - subtitle.height / 2,
    },
    group: { x: align === 'left' ? left + width / 2 : 0, y: centreY, width, height },
    rule: {
      x: align === 'left' ? left : 0,
      y: top + title.height + (subtitle ? gap * 0.42 : short * 0.035),
      width: Math.min(short * 0.16, width * 0.6),
      thickness,
    },
    fits: title.fits && (!subtitle || subtitle.fits),
  };
}
