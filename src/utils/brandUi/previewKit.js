/**
 * What a customisation looks like before it is saved: the complete kit a
 * draft amounts to over the kit it builds on, for the live preview to draw
 * elements from. Pure and isomorphic.
 * @module utils/brandUi/previewKit
 */

import { TOKEN_SCHEMA, readableOn } from '#utils/brand/index.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */
/** @typedef {import('./draft.js').Draft} Draft */

/** @type {(face: { family: string, weight: number, style: string }) => string} */
const faceId = (face) => `${face.family.toLowerCase()}|${face.weight}|${face.style}`;

/**
 * The complete kit a draft amounts to over its base, for drawing: the
 * base's tokens with the draft's on top (the fields of a font one by one),
 * colours the base derived derived anew, and files that were chosen but
 * not yet saved read from where the browser holds them.
 * @param {Kit} base - The effective kit the draft builds on
 * @param {Draft} draft
 * @param {(name: string) => string|undefined} [urlOf] - Where a file of
 *   the draft can be read from now; undefined for one that is not at hand
 * @returns {Kit}
 */
export function previewKit(base, draft, urlOf = () => undefined) {
  /** @type {Record<string, Record<string, any>>} */
  const tokens = {};
  for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
    tokens[group] = { ...base.tokens?.[group] };
    for (const [name, value] of Object.entries(draft.tokens[group] || {})) {
      const font = specs[name]?.type === 'font';
      tokens[group][name] = font ? { ...tokens[group][name], ...value } : value;
    }
  }
  for (const [name, spec] of Object.entries(TOKEN_SCHEMA.color)) {
    if (!spec.derived || draft.tokens.color?.[name]) continue;
    // Black or white, whichever reads — unless the base chose a colour of its own.
    const was = base.tokens?.color || {};
    if (!was[name] || was[name] === readableOn(was[spec.derived])) {
      tokens.color[name] = readableOn(tokens.color[spec.derived]);
    }
  }
  for (const name of ['main', 'mark']) {
    const chosen = draft.tokens.logo?.[name];
    if (chosen) tokens.logo[name] = urlOf(chosen) || '';
  }
  const mine = draft.fonts.flatMap((face) => {
    const file = urlOf(face.file);
    return file ? [{ ...face, file }] : [];
  });
  const taken = new Set(mine.map(faceId));
  const kept = (base.fonts || []).filter((face) => !taken.has(faceId(face)));
  return { ...base, tokens, fonts: [...mine, ...kept] };
}
