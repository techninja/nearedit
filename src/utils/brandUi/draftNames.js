/**
 * Names a saved customisation needs: a kit's id from the name a person
 * gives it, the files a draft names, and a draft with its files called
 * what the server stored them as. Pure and isomorphic.
 * @module utils/brandUi/draftNames
 */

/** @typedef {import('./draft.js').Draft} Draft */

/**
 * A kit's id from its name: `Acme Studio` → `acme-studio`.
 * @param {string} name
 * @returns {string} '' when nothing usable is left
 */
export function slugOf(name) {
  return String(name || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * @param {Draft} draft
 * @returns {string[]} The files the draft names, each once
 */
export function filesOf(draft) {
  const logo = draft.tokens.logo || {};
  const names = [logo.main, logo.mark, ...draft.fonts.map((face) => face.file)];
  return [...new Set(names.filter((name) => typeof name === 'string' && name))];
}

/**
 * A draft with its files called what the server stored them as.
 * @param {Draft} draft
 * @param {Map<string, string>} stored - Name in the draft → name on the server
 * @returns {Draft}
 */
export function withStoredNames(draft, stored) {
  const named = (/** @type {string} */ name) => stored.get(name) || name;
  const logo = { ...draft.tokens.logo };
  for (const slot of ['main', 'mark'].filter((key) => logo[key])) logo[slot] = named(logo[slot]);
  return {
    ...draft,
    tokens: { ...draft.tokens, ...(draft.tokens.logo && { logo }) },
    fonts: draft.fonts.map((face) => ({ ...face, file: named(face.file) })),
  };
}
