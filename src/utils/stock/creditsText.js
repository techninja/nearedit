/**
 * Credits as people expect to read them — title, creator, source, licence,
 * the form Creative Commons recommends — as plain text for a description
 * box, as Markdown with links, and as the short line an end card shows.
 * Unsplash and Pexels pictures are credited in the form those services ask
 * for. A credit with parts missing still reads as a sentence.
 * Isomorphic and pure. Contract: docs/app-spec/STOCK.md § In the document.
 * @module utils/stock/creditsText
 */

import { credits } from './credits.js';
import { licenseFacts } from './licenses.js';

/** @typedef {import('./credit.js').Credit} Credit */

export const CREDIT_FORMATS = Object.freeze(['txt', 'md']);

/** Services that are credited as "Photo by … on <service>". */
const SERVICES = Object.freeze({
  unsplash: { name: 'Unsplash', home: 'https://unsplash.com/' },
  pexels: { name: 'Pexels', home: 'https://www.pexels.com/' },
});
const CHANGED = 'Pictures may have been cropped, resized or moved over for this video.';

/** @param {string} text @returns {string} Safe as Markdown text */
const escaped = (text) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
/** @type {(text: string, url: string|undefined, md: boolean) => string} */
const linked = (text, url, md) => {
  if (!md) return text;
  return url ? `[${escaped(text)}](${url.replace(/[()]/g, encodeURIComponent)})` : escaped(text);
};

/**
 * "Photo by Annie Spratt on Unsplash", with the links the service asks for.
 * @param {Credit} credit
 * @param {keyof typeof SERVICES} id - The service, by the id of its licence
 * @param {boolean} md
 * @returns {string}
 */
function serviceLine(credit, id, md) {
  const service = SERVICES[id];
  const who = credit.creator || 'an unnamed photographer';
  if (id === 'pexels') {
    // Pexels: the whole credit links to the photo's page.
    const text = `Photo by ${who} on ${service.name}`;
    return md ? linked(text, credit.url, true) : [text, credit.url].filter(Boolean).join(' — ');
  }
  // Unsplash: the photographer links to their profile, "Unsplash" to Unsplash,
  // both with the referral the API terms ask for (kept from the profile's address).
  const referral = URL.canParse(credit.creatorUrl || '') ? new URL(credit.creatorUrl).search : '';
  const home = `${service.home}${referral}`;
  if (md) return `Photo by ${linked(who, credit.creatorUrl, true)} on ${linked(service.name, home, true)}`;
  const profile = credit.creatorUrl ? ` (${credit.creatorUrl})` : '';
  return `Photo by ${who}${profile} on ${service.name} (${home})`;
}

/**
 * One credit as a line of text.
 * @param {Credit} credit
 * @param {{ format?: string, links?: boolean }} [options] - `format`: `txt`
 *   (default) or `md`; `links: false` leaves web addresses out — what an
 *   end card shows
 * @returns {string} `“Foggy forest” by A. Person — CC BY 4.0 — https://…`
 */
export function creditLine(credit, options = {}) {
  const md = options.format === 'md';
  const links = options.links !== false;
  const facts = licenseFacts(credit.license);
  const service = /** @type {keyof typeof SERVICES} */ (Object.hasOwn(SERVICES, facts.id) && facts.id);
  if (service && links) return serviceLine(credit, service, md);
  if (service)
    return `Photo by ${credit.creator || 'an unnamed photographer'} on ${SERVICES[service].name}`;
  const title = credit.title ? `“${linked(credit.title, links ? credit.url : '', md)}”` : '';
  const who = credit.creator ? linked(credit.creator, links ? credit.creatorUrl : '', md) : '';
  // NASA is named as the source of a picture, not as its author.
  const nasa = facts.known && facts.id === 'nasa';
  const made = nasa ? `Image: ${who || 'NASA'}` : who && `by ${who}`;
  const work = nasa
    ? [title, made].filter(Boolean).join(' — ')
    : [title || (who ? 'Work' : 'Untitled work'), made].filter(Boolean).join(' ');
  const name = credit.license && !nasa ? (facts.known ? facts.name : credit.license) : '';
  const terms = name && linked(name, links ? credit.licenseUrl || facts.url : '', md);
  // In Markdown the title carries the link; plain text writes the address out.
  const page = links && credit.url && !(md && credit.title) ? credit.url : '';
  return [work, terms, md && page ? `<${page}>` : page].filter(Boolean).join(' — ');
}

/**
 * The credits of a timeline as text.
 * @param {any} edl - A document, or the list `credits(edl)` gave
 * @param {{ format?: string, heading?: string, range?: { start: number, end: number } | null }}
 *   [options] - `format`: `txt` (default) or `md`; `heading`: the first
 *   line (`Credits`; '' for none); `range`: only this part of the timeline
 * @returns {string} Ends with a line break; '' when nothing is owed
 */
export function creditsText(edl, options = {}) {
  const list = Array.isArray(edl) ? edl : credits(edl, { range: options.range });
  if (!list.length) return '';
  const md = options.format === 'md';
  const heading = options.heading ?? 'Credits';
  const lines = list.map((entry) => `${md ? '- ' : ''}${creditLine(entry, options)}`);
  // Creative Commons asks that changes to a work are indicated.
  const changed = list.some((entry) => /^cc-by/.test(entry.license || ''));
  const top = heading ? [md ? `## ${escaped(heading)}` : heading, ''] : [];
  const foot = changed ? ['', CHANGED] : [];
  return `${[...top, ...lines, ...foot].join('\n')}\n`;
}

/**
 * The host a credit points at, as an end card names it: `flickr.com`.
 * @param {Credit} credit
 * @returns {string} '' without a page
 */
export function creditHost(credit) {
  if (!URL.canParse(credit.url || '')) return '';
  return new URL(credit.url).hostname.replace(/^www\./, '');
}
