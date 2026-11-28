/**
 * A customisation in the making, as data: the kit it builds on and what it
 * changes — tokens, font files, a name. A draft holds only what differs
 * from its base, so what it leaves alone keeps following the kit it
 * extends. From a draft come the kit that is saved (`draftKit`) and the
 * complete kit the live preview draws (`previewKit.js`). Pure and isomorphic.
 * @module utils/brandUi/draft
 */

import { FONT_FIELDS, TOKEN_SCHEMA } from '#utils/brand/index.js';
import { isPlainObject, sameJson } from '#utils/edl/jsonBag.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */
/** @typedef {import('#utils/brand/fontTable.js').FontFace} FontFace */

/**
 * @typedef {Object} Draft
 * @property {string} extends - The kit it builds on: a library id or `builtin:<name>`
 * @property {string} name - What the kit is called; '' until given one
 * @property {Record<string, Record<string, any>>} tokens - Only what it changes
 * @property {FontFace[]} fonts - Font files it brings, named relative to its folder
 * @property {Record<string, any>} rest - What else the stored kit holds
 *   (elements, defaults, a description): kept as it is
 */

/**
 * Start a draft: from the project's own kit when it has one, else as a
 * new kit that extends the one in use.
 * @param {{ choice: string, kit: any }} state - The project's kit (`kitState`)
 * @returns {Draft}
 */
export function startDraft({ choice, kit }) {
  if (choice !== 'project' || !isPlainObject(kit)) {
    return { extends: choice, name: '', tokens: {}, fonts: [], rest: {} };
  }
  const { elements, defaults, description } = kit;
  return {
    extends: typeof kit.extends === 'string' ? kit.extends : '',
    name: typeof kit.name === 'string' ? kit.name : '',
    tokens: structuredClone(isPlainObject(kit.tokens) ? kit.tokens : {}),
    fonts: Array.isArray(kit.fonts) ? kit.fonts.map((face) => ({ ...face })) : [],
    rest: { elements, defaults, description },
  };
}

/**
 * @param {Record<string, any>|undefined} tokens
 * @param {string} path - `color.primary`, `font.heading`, `font.heading.family`
 * @returns {any} undefined for what is not set
 */
export function tokenAt(tokens, path) {
  let at = tokens;
  for (const key of path.split('.')) {
    if (!isPlainObject(at) || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

/**
 * @param {Draft} draft
 * @param {string} path
 * @returns {boolean} True when the draft sets this token (or this field of a font)
 */
export const isChanged = (draft, path) => tokenAt(draft.tokens, path) !== undefined;

/**
 * Take a token out of a draft: it follows the base again.
 * @param {Draft} draft
 * @param {string} path
 * @returns {Draft}
 */
export function resetToken(draft, path) {
  const [group, name, field] = path.split('.');
  if (tokenAt(draft.tokens, path) === undefined) return draft;
  const tokens = { ...draft.tokens, [group]: { ...draft.tokens[group] } };
  if (field) {
    const font = { ...tokens[group][name] };
    delete font[field];
    if (Object.keys(font).length) tokens[group][name] = font;
    else delete tokens[group][name];
  } else delete tokens[group][name];
  if (!Object.keys(tokens[group]).length) delete tokens[group];
  return { ...draft, tokens };
}

/**
 * Set a token. A value that says what the base says already is not kept:
 * the draft stays a list of differences.
 * @param {Draft} draft
 * @param {string} path
 * @param {any} value
 * @param {Kit} base - The effective kit the draft builds on
 * @returns {Draft}
 */
export function setToken(draft, path, value, base) {
  const [group, name, field] = path.split('.');
  if (!Object.hasOwn(TOKEN_SCHEMA, group) || !Object.hasOwn(TOKEN_SCHEMA[group], name))
    return draft;
  const derived = !field && TOKEN_SCHEMA[group][name].derived && value === '';
  // A field of a font the base leaves out is at its default there.
  const there = tokenAt(base.tokens, path) ?? (field ? FONT_FIELDS[field]?.default : undefined);
  if (derived || sameJson(value, there)) return resetToken(draft, path);
  const inGroup = { ...draft.tokens[group] };
  inGroup[name] = field ? { ...inGroup[name], [field]: value } : value;
  return { ...draft, tokens: { ...draft.tokens, [group]: inGroup } };
}

/**
 * Add a font file to a draft; a face it already had is replaced.
 * @param {Draft} draft
 * @param {FontFace} face
 * @returns {Draft}
 */
export function withFont(draft, face) {
  const same = (/** @type {FontFace} */ other) =>
    other.family.toLowerCase() === face.family.toLowerCase() &&
    other.weight === face.weight &&
    other.style === face.style;
  return { ...draft, fonts: [face, ...draft.fonts.filter((other) => !same(other))] };
}

/**
 * The kit a draft is saved as.
 * @param {Draft} draft
 * @param {string} [name] - Default: the draft's own
 * @returns {Record<string, any>} Without an id: where it is stored names it
 */
export function draftKit(draft, name = draft.name) {
  const rest = Object.fromEntries(
    Object.entries(draft.rest).filter(([, value]) => value !== undefined),
  );
  return { ...rest, name, extends: draft.extends, tokens: draft.tokens, fonts: draft.fonts };
}
