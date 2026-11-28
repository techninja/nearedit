/**
 * Base16 scheme files: sixteen named colours with agreed meanings, as the
 * Tinted Theming project publishes hundreds of them. A scheme file is YAML;
 * this reads the plain `key: value` lines such a file consists of — the
 * current form (`name`, `variant`, the colours under `palette`) and the
 * older one (`scheme` for the name, bare `base00: "181818"`). `fromBase16`
 * (`base16Map.js`) turns a scheme into a theme. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § Base16.
 * @module utils/theme/base16
 */

import { cleanColor } from './color.js';

/**
 * A Base16 scheme.
 * @typedef {Object} Base16Scheme
 * @property {string} name
 * @property {string} author
 * @property {'light'|'dark'|''} variant - '' when the file does not say
 * @property {string[]} colors - `base00` … `base0F` as `#rrggbb`
 */

/** The names of the sixteen colours. */
export const BASE16_NAMES = Array.from(
  { length: 16 },
  (_, i) => `base0${i.toString(16).toUpperCase()}`,
);

/** A scheme file is small; more than this is not one. */
export const MAX_SCHEME_CHARS = 16 * 1024;

/**
 * @param {string} line
 * @returns {[string, string]|null} The key and the value of a `key: value`
 *   line, quotes and a trailing comment removed; null for any other line
 */
function pair(line) {
  const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  const quoted = /^(["'])(.*?)\1/.exec(m[2]);
  const value = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '').trim();
  return [m[1], value];
}

/**
 * Read a Base16 scheme file.
 * @param {unknown} text - The file's text
 * @returns {{ scheme: Base16Scheme|null, problem: string }} `scheme` is null
 *   with the `problem` when the text is not a scheme
 */
export function parseBase16(text) {
  if (typeof text !== 'string') return { scheme: null, problem: 'is not text' };
  if (text.length > MAX_SCHEME_CHARS) return { scheme: null, problem: 'is too long for a scheme' };
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const found = pair(line);
    if (found && !(found[0].toLowerCase() in fields)) fields[found[0].toLowerCase()] = found[1];
  }
  const colors = BASE16_NAMES.map((name) => {
    const value = fields[name.toLowerCase()] || '';
    return cleanColor(value.startsWith('#') ? value : `#${value}`);
  });
  const missing = BASE16_NAMES.filter((_, i) => !colors[i]);
  if (missing.length === 16) return { scheme: null, problem: 'has none of base00 … base0F' };
  if (missing.length) {
    return { scheme: null, problem: `lacks a colour for ${missing.join(', ')}` };
  }
  const variant = /^(light|dark)$/.test(fields.variant) ? fields.variant : '';
  const scheme = {
    name: (fields.name || fields.scheme || '').slice(0, 80),
    author: (fields.author || '').slice(0, 200),
    variant: /** @type {Base16Scheme['variant']} */ (variant),
    colors,
  };
  return { scheme, problem: '' };
}
