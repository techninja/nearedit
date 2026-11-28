/**
 * A document's own fonts — its `fonts` table, `[{ family, weight, style,
 * file }]` — as families the text helpers can choose a face from. Hosts
 * load the files (the browser through `@font-face`, the server by
 * registering them); here they are only data. Documents are never changed
 * in place, so the families of a table are worked out once per table.
 * Isomorphic and pure. Contract: docs/app-spec/COMPOSITOR.md § Fonts.
 * @module utils/compose/fontFaces
 */

/** @typedef {import('./fonts.js').FontFamily} FontFamily */

/** @type {WeakMap<object, Map<string, FontFamily>>} */
const tables = new WeakMap();

/**
 * @param {any[]} faces
 * @returns {Map<string, FontFamily>} Families by lower-case name
 */
function familiesOf(faces) {
  /** @type {Map<string, FontFamily>} */
  const families = new Map();
  for (const face of faces) {
    if (!face || typeof face.family !== 'string' || !Number.isFinite(face.weight)) continue;
    const key = face.family.toLowerCase();
    if (!families.has(key)) {
      const blank = { weights: [], italics: false, italicWeights: [], custom: true };
      families.set(key, { id: face.family, label: face.family, generic: 'sans-serif', ...blank });
    }
    const family = families.get(key);
    const list = face.style === 'italic' ? family.italicWeights : family.weights;
    if (!list.includes(face.weight)) list.push(face.weight);
  }
  for (const family of families.values()) {
    family.italics = family.italicWeights.length > 0;
    // A family that comes only in italics is drawn with those.
    if (!family.weights.length) family.weights = [...family.italicWeights];
  }
  return families;
}

/**
 * The family a font table gives a name to.
 * @param {any[]|undefined} fonts - A document's font table
 * @param {string} name - Lower case
 * @returns {FontFamily|undefined}
 */
export function customFamily(fonts, name) {
  if (!Array.isArray(fonts) || !fonts.length) return undefined;
  let families = tables.get(fonts);
  if (!families) tables.set(fonts, (families = familiesOf(fonts)));
  return families.get(name);
}

/**
 * @param {any[]|undefined} fonts - A document's font table
 * @returns {string[]} The names of its families, each once
 */
export function customFamilyNames(fonts) {
  if (!Array.isArray(fonts)) return [];
  return [...new Set(fonts.map((face) => face?.family).filter((name) => typeof name === 'string'))];
}
