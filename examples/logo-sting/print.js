/**
 * Print a document the way one is written by hand: small objects — a key,
 * a point, a text block — on one line, everything else one entry per line.
 * The result is what prettier makes of it, so the files pass the format
 * check as they are.
 * @module examples/logo-sting/print
 */

/** Longest line. */
const WIDTH = 100;

/**
 * A value on one line, spaced like prettier does.
 * @param {any} value
 * @returns {string}
 */
function flat(value) {
  if (Array.isArray(value)) return `[${value.map(flat).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, v]) => `${JSON.stringify(key)}: ${flat(v)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/**
 * Whether a value holds another list or a nested object in a list: those
 * are opened up, one entry per line.
 * @param {any} value
 * @returns {boolean}
 */
function deep(value) {
  if (Array.isArray(value)) return value.some((v) => v && typeof v === 'object');
  if (value && typeof value === 'object') return Object.values(value).some(deep);
  return false;
}

/**
 * @param {any} value
 * @param {string} indent - Of the line the value starts on
 * @param {number} used - Characters already on that line before the value
 * @returns {string}
 */
function print(value, indent, used) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const line = flat(value);
  // The comma or bracket that follows needs a place on the line too.
  if (!deep(value) && used + line.length + 1 <= WIDTH) return line;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + print(v, inner, inner.length)).join(',\n')}\n${indent}]`;
  }
  const rows = Object.entries(value).map(([key, v]) => {
    const head = `${inner}${JSON.stringify(key)}: `;
    return head + print(v, inner, head.length);
  });
  return `{\n${rows.join(',\n')}\n${indent}}`;
}

/**
 * A document as the text of its file.
 * @param {Record<string, any>} doc
 * @returns {string}
 */
export function printDocument(doc) {
  return `${print(doc, '', 0)}\n`;
}
