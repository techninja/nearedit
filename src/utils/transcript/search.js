/**
 * Find text in a transcript. A query matches inside and across words
 * ("the par" finds "the park"), ignoring case and punctuation.
 * Pure and isomorphic.
 * @module utils/transcript/search
 */

/** @typedef {import('./units.js').Unit} Unit */

/** @typedef {{ first: number, last: number }} Match - Unit index range */

/**
 * Lower-case, with everything that is not a letter, digit or apostrophe
 * turned into single spaces.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

/**
 * Every place the query occurs, in transcript order.
 * @param {Unit[]} units
 * @param {string} query
 * @returns {Match[]}
 */
export function searchUnits(units, query) {
  const needle = normalizeText(query);
  if (!needle) return [];
  // One searchable string, remembering which unit each character came from.
  let haystack = '';
  /** @type {number[]} */
  const owner = [];
  units.forEach((unit, index) => {
    const text = normalizeText(unit.text);
    if (!text) return;
    if (haystack) {
      haystack += ' ';
      owner.push(index);
    }
    haystack += text;
    for (let i = 0; i < text.length; i++) owner.push(index);
  });
  /** @type {Match[]} */
  const matches = [];
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    matches.push({ first: owner[at], last: owner[at + needle.length - 1] });
    at = haystack.indexOf(needle, at + 1);
  }
  return matches;
}

/**
 * Step through matches, wrapping around at either end.
 * @param {number} count - Number of matches
 * @param {number} current - Index of the current match, -1 for none
 * @param {number} direction - 1 next, -1 previous
 * @returns {number} -1 when there are no matches
 */
export function stepMatch(count, current, direction) {
  if (!(count > 0)) return -1;
  if (current < 0) return direction < 0 ? count - 1 : 0;
  return (current + direction + count) % count;
}

/**
 * The match to show first: the first one at or after a unit (the word under
 * the playhead), else the first of all.
 * @param {Match[]} matches
 * @param {number} fromUnit
 * @returns {number} -1 when there are no matches
 */
export function firstMatchFrom(matches, fromUnit) {
  if (!matches.length) return -1;
  const at = matches.findIndex((match) => match.last >= fromUnit);
  return at < 0 ? 0 : at;
}
