/**
 * Filter-graph text helpers: number formatting, escaping and the small
 * expression snippets the render graph is assembled from. Pure.
 * @module api/render/expr
 */

/**
 * Format a number for a filter graph: plain decimal, never exponent notation.
 * @param {number} value
 * @param {number} [digits=6]
 * @returns {string}
 */
export function num(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const text = n.toFixed(digits);
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : trimmed;
}

/**
 * Escape an arbitrary string used as a filter option value. Two levels are
 * applied: the option parser (`\`, `'`, `:`) and the graph parser (`\`, `'`,
 * `[`, `]`, `,`, `;`). Nothing in the result can end the option, the filter
 * or the chain, so untrusted text (paths, font names) cannot inject filters.
 * @param {string} value
 * @returns {string}
 */
export function escapeValue(value) {
  return String(value)
    .replace(/([\\':])/g, '\\$1')
    .replace(/([\\'[\],;])/g, '\\$1');
}

/**
 * Quote an expression we generated ourselves (it may contain commas).
 * @param {string} expr - Must not contain quotes or backslashes
 * @returns {string}
 */
export function quote(expr) {
  if (/['\\]/.test(expr)) throw new Error(`Unquotable expression: ${expr}`);
  return `'${expr}'`;
}

/**
 * Build one filter: `name=key=value:key=value`. Numbers are formatted,
 * strings are emitted as given (escape or quote them first); undefined,
 * null and '' options are dropped.
 * @param {string} name
 * @param {Record<string, string|number|undefined|null>} [options]
 * @returns {string}
 */
export function filter(name, options = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}=${typeof value === 'number' ? num(value) : value}`);
  }
  return parts.length ? `${name}=${parts.join(':')}` : name;
}

/**
 * Linear interpolation `a → b` driven by a 0..1 progress expression.
 * Collapses to a constant when both ends are equal.
 * @param {number} a
 * @param {number} b
 * @param {string} progress - Expression yielding 0..1
 * @returns {string}
 */
export function lerpExpr(a, b, progress) {
  if (Math.abs(b - a) < 1e-9) return num(a);
  return `(${num(a)}+(${num(b - a)})*${progress})`;
}

/**
 * Progress expression 0..1 through a span, from a time variable.
 * @param {string} variable - e.g. 't'
 * @param {number} start - Value of the variable where progress is 0
 * @param {number} length - Span of the variable covering 0..1
 * @returns {string}
 */
export function progressExpr(variable, start, length) {
  const offset = Math.abs(start) < 1e-9 ? variable : `(${variable}-(${num(start)}))`;
  return `clip(${offset}/${num(length)},0,1)`;
}

/**
 * Parse a CSS-style hex colour into FFmpeg's `0xRRGGBB@alpha`. Only hex is
 * accepted, so a colour field can never smuggle graph syntax.
 * @param {unknown} value - `#rgb`, `#rrggbb` or `#rrggbbaa`
 * @param {string} [fallback=''] - Returned when the value is not a hex colour
 * @returns {string}
 */
export function hexColor(value, fallback = '') {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value ?? '').trim());
  if (!match) return fallback;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const alpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1;
  return `0x${hex.slice(0, 6)}@${num(alpha, 3)}`;
}
