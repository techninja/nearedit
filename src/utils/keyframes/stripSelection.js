/**
 * Which keys of the keyframe strip are selected, and how a press on a key
 * changes that. Pure and isomorphic.
 * @module utils/keyframes/stripSelection
 */

/** @typedef {import('./strip.js').StripRow} StripRow */
/** @typedef {import('./strip.js').StripKey} StripKey */

/**
 * The keys of the rows that a selection names.
 * @param {StripRow[]} rows
 * @param {string[]} selected - Key ids
 * @returns {StripKey[]}
 */
export function selectedKeys(rows, selected) {
  const wanted = new Set(selected);
  return rows.flatMap((row) => row.keys.filter((key) => wanted.has(key.id)));
}

/**
 * The selection after a key is pressed: a plain press selects just it
 * (keeping a multi-selection it is part of, so the whole set can be
 * dragged); with a modifier it is added or removed.
 * @param {string[]} selected
 * @param {string} id
 * @param {boolean} toggle - Shift, Ctrl or Cmd is held
 * @returns {string[]}
 */
export function pressSelection(selected, id, toggle) {
  const has = selected.includes(id);
  if (toggle) return has ? selected.filter((other) => other !== id) : [...selected, id];
  return has ? selected : [id];
}
