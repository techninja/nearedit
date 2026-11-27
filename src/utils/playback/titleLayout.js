/**
 * Title layout — the geometry of a title clip's text block, shared by the
 * preview compositor and usable by the FFmpeg renderer so both agree.
 * All sizes are pixels at output resolution. Pure and isomorphic: text
 * measurement is injected.
 * @module utils/playback/titleLayout
 */

/** Line pitch as a multiple of the font size. */
export const TITLE_LINE_HEIGHT = 1.2;

/** Background box padding on every side, as a multiple of the font size. */
export const TITLE_BOX_PADDING = 0.25;

const FAMILIES = ['sans-serif', 'serif', 'monospace'];

/**
 * @typedef {Object} TitleLayout
 * @property {string} font - CSS font shorthand
 * @property {'left'|'center'|'right'} align
 * @property {{ text: string, x: number, y: number }[]} lines - Anchor of each
 *   line relative to the block centre: x per `align`, y at the line's middle
 * @property {number} width - Text block width (widest line)
 * @property {number} height - Text block height (lines × line pitch)
 * @property {{ x: number, y: number, width: number, height: number }} box -
 *   Background rectangle (block plus padding), relative to the block centre
 */

/**
 * CSS font shorthand for a title text block.
 * @param {{ fontFamily?: string, fontSize?: number, bold?: boolean, italic?: boolean }} text
 * @returns {string}
 */
export function titleFont(text) {
  const family = FAMILIES.includes(text.fontFamily) ? text.fontFamily : 'sans-serif';
  const size = text.fontSize > 0 ? text.fontSize : 72;
  return `${text.italic ? 'italic ' : ''}${text.bold ? 'bold ' : ''}${size}px ${family}`;
}

/**
 * Split title content into lines.
 * @param {string} content
 * @returns {string[]}
 */
export function titleLines(content) {
  return String(content ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
}

/**
 * Lay out a title's text block around its own centre.
 * @param {any} text - The clip's `text` block
 * @param {(line: string, font: string) => number} measure - Width of a line in px
 * @returns {TitleLayout}
 */
export function layoutTitle(text, measure) {
  const font = titleFont(text);
  const size = text.fontSize > 0 ? text.fontSize : 72;
  const align = text.align === 'left' || text.align === 'right' ? text.align : 'center';
  const content = titleLines(text.content);
  const pitch = size * TITLE_LINE_HEIGHT;
  const width = Math.max(0, ...content.map((line) => measure(line, font)));
  const height = content.length * pitch;
  const x = align === 'left' ? -width / 2 : align === 'right' ? width / 2 : 0;
  const lines = content.map((line, i) => ({ text: line, x, y: -height / 2 + pitch * (i + 0.5) }));
  const pad = size * TITLE_BOX_PADDING;
  const box = {
    x: -width / 2 - pad,
    y: -height / 2 - pad,
    width: width + pad * 2,
    height: height + pad * 2,
  };
  return { font, align, lines, width, height, box };
}
