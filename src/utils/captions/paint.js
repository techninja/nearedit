/**
 * How a caption looks at an instant: the colour, opacity and size of every
 * word — said, being said, not yet said — and how far the whole caption is
 * into its arrival. Everything is a closed-form function of the time since
 * the group and the word began; nothing is carried from one frame to the
 * next, and no word's place depends on it.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/paint
 */

import { parseColor, rgba } from '#utils/compose/color.js';
import { ease } from '#utils/edl/easing.js';

/** @typedef {import('./types.js').CaptionStyle} CaptionStyle */
/** @typedef {{ color: string, alpha: number }} Look */

/** How present a dimmed word is, 0..1. */
export const DIM = 0.6;
/** How much a word grows at the height of a pop. */
export const POP = 0.08;

/**
 * A colour between two.
 * @param {string} from - Hex
 * @param {string} to - Hex
 * @param {number} t - 0 = `from`, 1 = `to`
 * @returns {string} One of the two as given, or an `rgba()` between them
 */
export function mix(from, to, t) {
  if (t <= 0 || from === to) return from;
  if (t >= 1) return to;
  const a = parseColor(from);
  const b = parseColor(to);
  const at = (/** @type {number} */ i) => a[i] + (b[i] - a[i]) * t;
  return rgba(at(0), at(1), at(2), at(3));
}

/**
 * The colour letters take on a pill: dark on a light one, white on a dark one.
 * @param {string} pill - Hex
 * @returns {string}
 */
export function inkOn(pill) {
  const [r, g, b] = parseColor(pill);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#0b0f19' : '#ffffff';
}

/**
 * How far the whole caption is into its arrival.
 * @param {CaptionStyle} style
 * @param {number} age - Seconds since the group appeared
 * @returns {{ alpha: number, scale: number, dy: number }} `dy` in font
 *   sizes, downward. Something is visible from the very first frame
 */
export function arrival(style, age) {
  const { in: how, seconds } = style.motion;
  const p = seconds > 0 ? Math.min(1, Math.max(0, age) / seconds) : 1;
  if (how === 'none' || p >= 1) return { alpha: 1, scale: 1, dy: 0 };
  const e = ease('ease-out', p);
  if (how === 'pop') {
    return { alpha: Math.min(1, 0.5 + 2 * p), scale: 0.72 + 0.28 * ease('back-out', p), dy: 0 };
  }
  return { alpha: 0.25 + 0.75 * e, scale: 1, dy: how === 'slide' ? 0.5 * (1 - e) : 0 };
}

/**
 * How far the mark is into arriving at the word being said.
 * @param {CaptionStyle} style
 * @param {{ wordAge: number }} state
 * @returns {{ p: number, e: number }} Linear and eased progress, 0..1
 */
export function markProgress(style, state) {
  const { word: how, seconds } = style.motion;
  const p =
    how === 'none' || !(seconds > 0) ? 1 : Math.min(1, Math.max(0, state.wordAge) / seconds);
  return { p, e: ease('ease-out', p) };
}

/**
 * The look of every word of a group at an instant.
 * @param {CaptionStyle} style - Resolved
 * @param {number} count - Words in the group
 * @param {{ word: number, wordAge: number, wordProgress: number }} state
 * @returns {Pick<import('./types.js').LaidWord, 'state' | 'color' | 'alpha' | 'scale' | 'dy' |
 *   'sweep' | 'rest'>[]} `dy` in font sizes
 */
export function paintWords(style, count, state) {
  const { mode, scale: big } = style.highlight;
  const how = style.motion.word;
  const { p, e } = markProgress(style, state);
  const colored = mode === 'color' || mode === 'scale';
  /** @type {Look} */
  const said = { color: style.color, alpha: 1 };
  /** @type {Look} */
  const saying = { color: colored ? style.highlight.color : style.color, alpha: 1 };
  // With an outline, a dimmed word is an opaque darker one: a translucent
  // fill would let its own outline show through.
  const dark = mix(style.color, style.stroke.color, 1 - DIM);
  /** @type {Look} */
  const dim =
    style.stroke.width > 0 ? { color: dark, alpha: 1 } : { color: style.color, alpha: DIM };
  const hidden = style.unspoken === 'hide';
  /** @type {Look} */
  const unsaid = hidden ? { color: style.color, alpha: 0 } : style.unspoken === 'dim' ? dim : said;
  // A word that comes out of nothing shows a little from its first frame.
  const share = (/** @type {Look} */ a) => (a.alpha === 0 ? 0.3 + 0.7 * e : e);
  const between = (/** @type {Look} */ a, /** @type {Look} */ b) =>
    how === 'glide'
      ? { color: mix(a.color, b.color, e), alpha: a.alpha + (b.alpha - a.alpha) * share(a) }
      : b;
  const still = { scale: 1, dy: 0, sweep: 1, rest: null };
  return Array.from({ length: count }, (_, i) => {
    if (i > state.word) return { state: 'unsaid', ...unsaid, ...still };
    if (i < state.word) {
      const leaving = i === state.word - 1 && how !== 'none';
      const scale = leaving && mode === 'scale' ? big - (big - 1) * e : 1;
      return { state: 'said', ...(leaving ? between(saying, said) : said), ...still, scale };
    }
    const grow = how === 'pop' ? ease('back-out', p) : e;
    let scale = mode === 'scale' ? 1 + (big - 1) * grow : 1;
    if (how === 'pop' && hidden) scale *= 0.6 + 0.4 * grow;
    else if (how === 'pop' && mode !== 'scale') scale = 1 + POP * Math.sin(Math.PI * p);
    const differs = unsaid.color !== saying.color || unsaid.alpha !== saying.alpha;
    const filling = how === 'fill' && state.wordProgress < 1 && differs;
    return {
      state: 'saying',
      ...(filling ? saying : between(unsaid, saying)),
      scale,
      dy: hidden && how === 'glide' ? 0.2 * (1 - e) : 0,
      sweep: filling ? state.wordProgress : 1,
      rest: filling && !hidden ? unsaid : null,
    };
  });
}
