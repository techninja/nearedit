/**
 * Typesetting for a motion piece: the largest size at which a text fits
 * its box in few enough lines without a word being broken, wrapped so the
 * lines come out about equally long. The result is a `text` block the
 * compositor wraps exactly as it was measured here.
 * @module api/director/motion/typeset
 */

import { layoutText, textStyle } from '#utils/compose/index.js';

/**
 * @typedef {import('#utils/director/motion/themes.js').ThemeFont} ThemeFont
 * @typedef {import('./measure.js').Measure} Measure
 * @typedef {Object} TextBox
 * @property {number} width - Widest the block may be, output pixels
 * @property {number} height - Tallest it may be
 * @property {number} lines - Most lines
 * @property {number} size - Font size to start from
 * @property {number} min - Smallest font size worth showing
 * @typedef {Object} Fitted
 * @property {object} text - Fields for a clip's `text` block (no content)
 * @property {number} width - Width of the block as it will be drawn
 * @property {number} height - Its height: lines × line pitch
 * @property {number} lines
 * @property {number} fontSize
 * @property {boolean} fits - False when even the smallest size overflows the box
 */

const SHRINK = 0.94;

/**
 * The style fields of a font at a size.
 * @param {ThemeFont} font
 * @param {number} fontSize
 * @param {'left'|'center'|'right'} align
 * @param {number} maxWidth
 * @returns {object}
 */
function fontFields(font, fontSize, align, maxWidth) {
  return {
    fontFamily: font.fontFamily,
    fontSize,
    weight: font.weight,
    bold: font.weight >= 600,
    italic: Boolean(font.italic),
    lineHeight: font.lineHeight || 1.15,
    letterSpacing: Math.round((font.tracking || 0) * fontSize * 10) / 10,
    align,
    maxWidth,
  };
}

/**
 * Fit a text into a box.
 * @param {string} content
 * @param {ThemeFont} font
 * @param {TextBox} box
 * @param {Measure} measure
 * @param {'left'|'center'|'right'} [align='center']
 * @returns {Fitted}
 */
export function fitText(content, font, box, measure, align = 'center') {
  const words = content.split(/\s+/).filter(Boolean);
  /** @param {number} size @param {number} maxWidth */
  const lay = (size, maxWidth) => {
    const fields = fontFields(font, size, align, maxWidth);
    const style = textStyle({ ...fields, content });
    const run = (/** @type {string} */ text) => measure(style, text);
    const layout = layoutText(style, run);
    const widest = Math.max(0, ...words.map((word) => run(word) - style.letterSpacing));
    return { fields, layout, widest };
  };
  let size = Math.max(box.min, Math.round(box.size));
  let set = lay(size, box.width);
  const fitsBox = () =>
    set.layout.lines.length <= box.lines &&
    set.layout.height <= box.height &&
    set.widest <= box.width;
  while (!fitsBox() && size > box.min) {
    size = Math.max(box.min, Math.floor(size * SHRINK));
    set = lay(size, box.width);
  }
  const fits = fitsBox();
  const count = set.layout.lines.length;
  if (count > 1) {
    // The narrowest wrap width that keeps this number of lines evens them out.
    let [low, high] = [Math.min(set.widest, box.width), box.width];
    for (let i = 0; i < 14 && high - low > 1; i++) {
      const middle = (low + high) / 2;
      if (lay(size, middle).layout.lines.length <= count) high = middle;
      else low = middle;
    }
    set = lay(size, Math.min(box.width, Math.ceil(high + size * 0.02)));
  }
  return {
    text: set.fields,
    width: set.layout.width,
    height: set.layout.height,
    lines: set.layout.lines.length,
    fontSize: size,
    fits,
  };
}
