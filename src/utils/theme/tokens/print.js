/**
 * A Design Tokens document as text a person can read and edit: one token a
 * line, groups indented. Pure.
 * @module utils/theme/tokens/print
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { isToken } from './refs.js';

/**
 * JSON with spaces after `:` and `,`, on one line.
 * @param {unknown} value
 * @returns {string}
 */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (!isPlainObject(value)) return JSON.stringify(value);
  const entries = Object.entries(/** @type {object} */ (value));
  if (!entries.length) return '{}';
  return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }`;
}

/**
 * @param {unknown} doc - A Design Tokens document
 * @returns {string} JSON: groups over several lines, every token and every
 *   `$` property on one; ends with a line break
 */
export function printTokens(doc) {
  /** @type {(node: unknown, pad: string) => string} */
  const print = (node, pad) => {
    if (!isPlainObject(node) || isToken(node)) return inline(node);
    const entries = Object.entries(/** @type {object} */ (node));
    if (!entries.length) return '{}';
    const lines = entries.map(([key, value]) => {
      const text = key.startsWith('$') ? inline(value) : print(value, `${pad}  `);
      return `${pad}  ${JSON.stringify(key)}: ${text}`;
    });
    return `{\n${lines.join(',\n')}\n${pad}}`;
  };
  return `${print(doc, '')}\n`;
}
