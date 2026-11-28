/**
 * A found picture, whatever provider found it, and the source that is
 * written beside its file once it was picked. Both are plain data: text
 * cut to its limit, web addresses and nothing else, sizes as whole numbers.
 * Isomorphic and pure. Contract: docs/app-spec/STOCK.md § Providers.
 * @module utils/stock/item
 */

import { CREDIT_LIMITS, cleanLicense, cleanText, cleanUrl } from './credit.js';

/**
 * @typedef {Object} FoundItem
 * @property {string} provider - `openverse`, `wikimedia`, `nasa`, `unsplash`, `pexels`
 * @property {string} id - The provider's own id of the picture
 * @property {string} title - '' when the provider has none
 * @property {string} creator - '' when the provider names nobody
 * @property {string} creatorUrl
 * @property {string} pageUrl - Where the picture is shown with its licence
 * @property {string} thumbUrl - A small rendition, for showing results
 * @property {number} width - Pixels of the original; 0 when not known
 * @property {number} height
 * @property {string} license - A licence id (`licenseFacts`)
 * @property {string} licenseUrl
 */

/**
 * @typedef {Object} Source - Where a file in a project came from
 * @property {string} [provider]
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [creator]
 * @property {string} [creatorUrl]
 * @property {string} [pageUrl]
 * @property {string} [license]
 * @property {string} [licenseUrl]
 * @property {string} [fetchedAt] - ISO time the file was copied
 */

/** What a provider's id may look like once it names a file: letters, digits, `._-`. */
const ID_SAFE = /[^a-z0-9._-]+/gi;
/** @type {Record<string, number>} */
const LIMITS = CREDIT_LIMITS;

/** @param {unknown} value @returns {number} A whole number of pixels, 0 when unknown */
const pixels = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && number > 0 && number < 1e6 ? Math.round(number) : 0;
};

/** @param {unknown} value @returns {string} A provider's name as an id: lower case */
const providerId = (value) => cleanText(value, CREDIT_LIMITS.provider).toLowerCase();

/**
 * Read a found item out of what a provider module made of an answer.
 * @param {any} raw
 * @returns {FoundItem|null} Every field present; null without a provider and an id
 */
export function normalizeItem(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const provider = providerId(raw.provider);
  const id = cleanText(raw.id, CREDIT_LIMITS.id);
  if (!provider || !id) return null;
  return {
    ...{ provider, id, title: cleanText(raw.title, CREDIT_LIMITS.title) },
    ...{ creator: cleanText(raw.creator, CREDIT_LIMITS.creator) },
    ...{ creatorUrl: cleanUrl(raw.creatorUrl), pageUrl: cleanUrl(raw.pageUrl) },
    ...{ thumbUrl: cleanUrl(raw.thumbUrl), width: pixels(raw.width), height: pixels(raw.height) },
    ...{ license: cleanLicense(raw.license) || 'unknown', licenseUrl: cleanUrl(raw.licenseUrl) },
  };
}

/**
 * Read a source out of a sidecar or a form.
 * @param {any} raw
 * @returns {Source|null} Only the parts that say something; null when it
 *   names no title, creator, licence or page
 */
export function cleanSource(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const source = {};
  const keep = (/** @type {string} */ name, /** @type {string} */ text) => {
    if (text) source[name] = text;
  };
  keep('provider', providerId(raw.provider));
  for (const name of ['id', 'title', 'creator']) keep(name, cleanText(raw[name], LIMITS[name]));
  for (const name of ['creatorUrl', 'pageUrl']) keep(name, cleanUrl(raw[name]));
  keep('license', cleanLicense(raw.license));
  keep('licenseUrl', cleanUrl(raw.licenseUrl));
  if (!source.title && !source.creator && !source.license && !source.pageUrl) return null;
  const at = typeof raw.fetchedAt === 'string' ? Date.parse(raw.fetchedAt) : NaN;
  if (Number.isFinite(at)) source.fetchedAt = new Date(at).toISOString();
  return source;
}

/**
 * The source written beside the file of a found item.
 * @param {FoundItem} item
 * @param {Date} [when] - When it was fetched
 * @returns {Source}
 */
export function sourceOfItem(item, when = new Date()) {
  const { provider, id, title, creator, creatorUrl, pageUrl, license, licenseUrl } = item;
  return cleanSource({
    ...{ provider, id, title, creator, creatorUrl, pageUrl, license, licenseUrl },
    fetchedAt: when.toISOString(),
  });
}

/**
 * The name of a found item's file in a project, without its extension:
 * `openverse-0aff3595-8168-440b-83ff-7a80b65dea42`.
 * @param {string} provider
 * @param {string} id
 * @returns {string} '' when nothing of the id can name a file
 */
export function stockName(provider, id) {
  const safe = String(id).replace(ID_SAFE, '_').replace(/^[._]+/, '').slice(0, 120);
  return providerId(provider) && safe ? `${providerId(provider).replace(ID_SAFE, '_')}-${safe}` : '';
}
