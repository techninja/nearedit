/**
 * The logo as inline SVG markup, one string per variant, built from the
 * shapes. The parts carry class names so the stylesheet can move them:
 * `app-logo-playhead`, `app-logo-clip` (with `--i`, its turn, and `--w`,
 * its length) and `app-logo-letter` (with `--i`). Pure — no DOM.
 * @module components/atoms/app-logo/markup
 */

import {
  CLIPS,
  CLIP_HEIGHT,
  CLIP_RADIUS,
  COLORS,
  DIT,
  ICON,
  LETTERS,
  MARK,
  NEAR,
  STEM,
  WORDMARK,
  playhead,
} from './shapes.js';

/** @typedef {'wordmark'|'icon'|'mark'} LogoVariant */

/** Room to the right of the longest clip, for a clip that overshoots as it arrives. */
const WINDOW = 80;

/**
 * The E as a timeline: three clips, then the playhead over their left
 * ends. The clips sit in a nested `<svg>`, whose edge is the middle of the
 * playhead: a clip moved left of it is hidden, so it can slide out from
 * behind the playhead on any ground.
 * @param {number} x - Left edge of the playhead's stem
 * @returns {string}
 */
function timeline(x) {
  const clips = CLIPS.map((clip, i) => {
    const width = clip.end - STEM / 2;
    return (
      `<rect class="app-logo-clip" style="--i:${i};--w:${width}px" y="${clip.y}" ` +
      `width="${width}" height="${CLIP_HEIGHT}" rx="${CLIP_RADIUS}" fill="${clip.fill}"/>`
    );
  });
  return (
    `<svg x="${x + STEM / 2}" y="0" width="${WINDOW}" height="100" overflow="hidden">` +
    `${clips.join('')}</svg>` +
    `<path class="app-logo-playhead" d="${playhead(x)}" fill="${COLORS.red}"/>`
  );
}

/**
 * Letters as paths, in the order they settle.
 * @param {string[]} names
 * @returns {string}
 */
function letters(names) {
  return names
    .map((name, i) => `<path class="app-logo-letter" style="--i:${i}" d="${LETTERS[name]}"/>`)
    .join('');
}

/**
 * The opening tag every variant shares.
 * @param {string} viewBox
 * @returns {string}
 */
function open(viewBox) {
  return `<svg class="app-logo-svg" viewBox="${viewBox}" role="img" aria-label="NearEdit">`;
}

/** @type {Record<LogoVariant, string>} */
const MARKUP = {
  // The letters take the colour of the text around them; the E keeps its own.
  wordmark:
    `${open(WORDMARK.viewBox)}<g fill="currentColor">${letters(NEAR)}${letters(DIT)}</g>` +
    `${timeline(WORDMARK.stem)}</svg>`,
  // The tile carries its own ground, so it is the same on every theme.
  icon:
    `${open(ICON.viewBox)}<rect width="224" height="224" rx="${ICON.radius}" ` +
    `fill="${COLORS.navy}"/><g transform="translate(${ICON.at.join(' ')})">` +
    `<path class="app-logo-letter" style="--i:0" d="${ICON.n}" fill="#ffffff"/>` +
    `${timeline(ICON.stem)}</g></svg>`,
  mark: `${open(MARK.viewBox)}${timeline(MARK.stem)}</svg>`,
};

/**
 * The markup of one variant; the wordmark for a name that is not one.
 * @param {string} variant
 * @returns {string}
 */
export function logoMarkup(variant) {
  return MARKUP[/** @type {LogoVariant} */ (variant)] || MARKUP.wordmark;
}
