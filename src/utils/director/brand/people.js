/**
 * The people and the chapters of a brand request, as they are written in a
 * form field or a line of the brief: `Ada Lovelace — CEO; Grace Hopper —
 * Rear Admiral`, `Arrival; The river at 1:05; Home`.
 * Isomorphic and pure.
 * @module utils/director/brand/people
 */

import { clock } from './line.js';

/** @typedef {import('./request.js').Speaker} Speaker */
/** @typedef {import('./request.js').Chapter} Chapter */

/**
 * One speaker as people write one: `Ada Lovelace — CEO`, `Ada Lovelace, CEO`,
 * `Ada Lovelace (CEO)`, `Ada Lovelace at 0:12`.
 * @param {string} text
 * @returns {Speaker|null}
 */
export function readSpeaker(text) {
  const timed = /^(.*?)(?:[\s,]+at\s+(\d[\d:.]*\s*s?))?\s*$/i.exec(
    text.replace(/\s+/g, ' ').trim(),
  );
  const said = timed?.[1] || '';
  const bracket = /^(.*?)\s*\(([^)]*)\)$/.exec(said);
  const [name, ...role] = bracket
    ? [bracket[1], bracket[2]]
    : said.split(/\s+[—–-]+\s+|\s*[,:]\s*/);
  const clean = (/** @type {string} */ part) => part.replace(/^[-*•·\s]+/, '').trim();
  if (!clean(name || '')) return null;
  return {
    name: clean(name),
    role: clean(role.join(', ')),
    at: timed?.[2] ? clock(timed[2]) : null,
  };
}

/**
 * @param {string} text - `A; B; C`, each perhaps with ` at 1:05`
 * @param {(entry: string) => T|null} read
 * @returns {T[]}
 * @template T
 */
export const listOf = (text, read) =>
  String(text || '')
    .split(/\s*[;\n]\s*/)
    .map((entry) => read(entry.trim()))
    .filter(Boolean);

/** @param {string} text @returns {Chapter|null} */
export function readChapter(text) {
  const timed = /^(.*?)(?:[\s,]+at\s+(\S+))?$/i.exec(text);
  const title = (timed?.[1] || '').replace(/^\d{1,2}[.)]\s+/, '').trim();
  return title ? { title, at: timed?.[2] ? clock(timed[2]) : null } : null;
}
