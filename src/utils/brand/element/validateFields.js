/**
 * Checking the fields of one layer or one group: that each is a field of
 * the language with a usable value, that every reference names a token or
 * a slot that exists, that what it is placed by is there, that its motions
 * are known. Isomorphic and pure.
 * @module utils/brand/element/validateFields
 */

import { TOKEN_SCHEMA } from '#utils/brand/tokens.js';
import { readShape } from './fields.js';
import { references, slotOf } from './refs.js';
import { MOTIONS } from './vocabulary.js';

/** @typedef {(path: string, message: string, level?: 'error'|'warning') => void} Report */

/**
 * @param {string} path - A token reference, e.g. `color.primary`, `font.heading.family`
 * @returns {boolean} True when the schema has such a token
 */
export function isToken(path) {
  const [group, name, field, more] = path.split('.');
  if (!Object.hasOwn(TOKEN_SCHEMA, group) || more !== undefined) return false;
  if (name === undefined) return true;
  const spec = Object.hasOwn(TOKEN_SCHEMA[group], name) ? TOKEN_SCHEMA[group][name] : null;
  return Boolean(spec) && (field === undefined || spec.type === 'font');
}

/**
 * Check the fields of one layer or group.
 * @param {any} raw
 * @param {Record<string, string>} fields
 * @param {string} at
 * @param {{ slots: Set<string>, boxes: Set<string>, groups: Set<string>, tokens: boolean }} known
 * @param {Report} report
 */
export function checkFields(raw, fields, at, known, report) {
  const read = readShape(raw, fields) || {};
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(fields, key)) report(`${at}.${key}`, 'is not a field', 'warning');
    else if (!Object.hasOwn(read, key)) report(`${at}.${key}`, 'is not a usable value');
  }
  for (const reference of references(raw)) {
    const slot = slotOf(reference);
    if (slot !== null && !known.slots.has(slot)) {
      report(at, `refers to {${reference}}, but the element has no slot "${slot}"`);
    } else if (slot === null && known.tokens && !isToken(reference)) {
      report(at, `refers to {${reference}}, which is not a token`);
    } else if (slot === null && !known.tokens) {
      report(at, `still refers to {${reference}}: a design has its tokens filled in`, 'warning');
    }
  }
  for (const key of ['inside', 'around', 'beside'].filter((name) => read[name] !== undefined)) {
    if (!known.boxes.has(read[key]))
      report(`${at}.${key}`, `"${read[key]}" is not a layer or a group`);
  }
  if (read.in !== undefined && !known.groups.has(read.in)) {
    report(`${at}.in`, `"${read.in}" is not a group of this element`);
  }
  for (const key of ['enter', 'exit']) {
    const motion = typeof read[key] === 'string' ? read[key] : read[key]?.motion;
    if (typeof motion === 'string' && !motion.includes('{') && !MOTIONS.includes(motion)) {
      report(`${at}.${key}`, `"${motion}" is not a motion — one of: ${MOTIONS.join(', ')}`);
    }
  }
}
