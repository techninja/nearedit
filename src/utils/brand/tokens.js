/**
 * Reading tokens: every token at its default, and one token of a kit by
 * its dotted path. The schema itself is `tokenSchema.js`.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/tokens
 */

import { TOKEN_SCHEMA } from './tokenSchema.js';

export { FONT_FIELDS, TOKEN_SCHEMA } from './tokenSchema.js';

/** @typedef {import('./tokenSchema.js').TokenSpec} TokenSpec */

/**
 * @returns {Record<string, Record<string, any>>} Every token at its default
 *   (derived colours left empty: `resolveKit` fills them in)
 */
export function defaultTokens() {
  /** @type {Record<string, Record<string, any>>} */
  const tokens = {};
  for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
    tokens[group] = {};
    for (const [name, spec] of Object.entries(specs)) {
      if (spec.derived) continue;
      tokens[group][name] = spec.type === 'font' ? { ...spec.default } : spec.default;
    }
  }
  return tokens;
}

/**
 * Read a token by its dotted path: `color.primary`, `font.heading`,
 * `font.heading.family`, `motion` (the whole group).
 * @param {{ tokens?: Record<string, any> } | null | undefined} kit
 * @param {string} path
 * @returns {any} undefined for a token the kit does not have
 */
export function tokenValue(kit, path) {
  let at = kit?.tokens;
  for (const key of String(path).split('.')) {
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}
