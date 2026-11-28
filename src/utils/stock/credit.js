/**
 * The credit a clip carries — what the timeline owes for what the clip
 * shows or plays: `{ title, creator, creatorUrl, provider, license,
 * licenseUrl, url }`, every part optional. It comes from the source of a
 * found picture, or is written by hand for anything: a friend's
 * photograph, licensed music. Only text and web addresses are kept, each
 * cut to its limit. Isomorphic and pure.
 * Contract: docs/app-spec/STOCK.md § In the document.
 * @module utils/stock/credit
 */

import { licenseFacts } from './licenses.js';

/**
 * @typedef {Object} Credit
 * @property {string} [title] - What the work is called
 * @property {string} [creator] - Who made it
 * @property {string} [creatorUrl] - Their page
 * @property {string} [provider] - Where it was found: `openverse`, or a name written by hand
 * @property {string} [license] - A licence id (`cc-by-4.0`), or words of one's own
 * @property {string} [licenseUrl] - The licence's terms
 * @property {string} [url] - The page of the work
 */

/** @typedef {(path: string, message: string) => void} Report */

/** Longest each text may be, characters. */
export const CREDIT_LIMITS = Object.freeze({
  ...{ title: 300, creator: 200, provider: 40, license: 80, url: 2000, id: 200 },
});

/** The parts of a credit, in the order they are stored. */
export const CREDIT_FIELDS = Object.freeze([
  ...['title', 'creator', 'creatorUrl', 'provider', 'license', 'licenseUrl', 'url'],
]);
const URLS = new Set(['creatorUrl', 'licenseUrl', 'url']);
/** Control characters, and the marks that reorder or hide text. */
const UNSEEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * One line of plain text: no control characters, runs of space closed up.
 * @param {unknown} value
 * @param {number} max - Characters kept
 * @returns {string} '' for anything that is not text
 */
export function cleanText(value, max) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string') return '';
  return text.replace(UNSEEN, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/**
 * A web address: `http` or `https`, nothing else — no script, no file.
 * @param {unknown} value
 * @returns {string} The address as written; '' when it is not one
 */
export function cleanUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > CREDIT_LIMITS.url || /[\s<>"\\^`{|}]/.test(text)) return '';
  if (!/^https?:\/\/[^/?#]+/i.test(text) || !URL.canParse(text)) return '';
  return text;
}

/**
 * A licence as a credit names it: the id when it is one NearEdit knows,
 * otherwise the words as written ("Used with permission").
 * @param {unknown} value
 * @returns {string}
 */
export function cleanLicense(value) {
  const text = cleanText(value, CREDIT_LIMITS.license);
  return licenseFacts(text).known ? text.toLowerCase() : text;
}

/**
 * Read a credit out of whatever a document, a sidecar or a form holds.
 * @param {any} raw
 * @returns {Credit|null} Only the parts that say something, in the order of
 *   `CREDIT_FIELDS`; null when it names no title, creator, licence or page —
 *   the object itself when it is already clean
 */
export function cleanCredit(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const credit = {};
  for (const name of CREDIT_FIELDS) {
    if (!Object.hasOwn(raw, name)) continue;
    const text = URLS.has(name)
      ? cleanUrl(raw[name])
      : name === 'license'
        ? cleanLicense(raw[name])
        : cleanText(raw[name], CREDIT_LIMITS[name]);
    if (text) credit[name] = text;
  }
  if (!credit.title && !credit.creator && !credit.license && !credit.url) return null;
  const names = Object.keys(credit);
  const given = Object.keys(raw);
  const same = given.length === names.length && names.every((name, i) => given[i] === name);
  return same && names.every((name) => raw[name] === credit[name]) ? raw : credit;
}

/**
 * Check a clip's `credit` for `validateEdl`: absent, or exactly what
 * `cleanCredit` writes.
 * @param {any} credit
 * @param {string} path - `tracks[0].clips[2].credit`
 * @param {Report} report
 */
export function checkCredit(credit, path, report) {
  if (credit === undefined) return;
  if (cleanCredit(credit) !== credit) {
    report(path, 'must hold title, creator, licence and web addresses as text (see cleanCredit)');
  }
}

/**
 * The credit a source asks for: what a found picture's sidecar says, as a
 * clip carries it.
 * @param {any} source - `{ provider, title, creator, creatorUrl, pageUrl,
 *   license, licenseUrl }` (STOCK.md § In the project)
 * @returns {Credit|null} null when the source says nothing
 */
export function creditFromSource(source) {
  if (typeof source !== 'object' || source === null) return null;
  const { title, creator, creatorUrl, provider, license, licenseUrl } = source;
  return cleanCredit({
    ...{ title, creator, creatorUrl, provider, license, licenseUrl },
    url: source.pageUrl ?? source.url,
  });
}

/**
 * Two credits for the same work have the same key: its page when it has
 * one, otherwise what it is called, by whom, under what.
 * @param {Credit} credit
 * @returns {string}
 */
export function creditKey(credit) {
  if (credit.url) return credit.url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
  const { title = '', creator = '', license = '', provider = '' } = credit;
  return [provider, title, creator, license].join('\n').toLowerCase();
}
