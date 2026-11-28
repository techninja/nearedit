/**
 * The storage file of a recipe: cookies and local storage that put the
 * browser where a login would — in the format browser automation tools
 * export (`{ cookies: [...], origins: [{ origin, localStorage: [...] }] }`).
 * It is read when a recording starts and never copied anywhere.
 * @module api/web/storage
 */

import { readFileSync } from 'node:fs';
import { WebError } from './errors.js';

/**
 * @typedef {Object} Storage
 * @property {object[]} cookies - DevTools cookie parameters
 * @property {{ origin: string, items: { name: string, value: string }[] }[]} origins
 */

const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' };
const text = (/** @type {any} */ value) =>
  typeof value === 'string' ? value : String(value ?? '');

/**
 * Read and check a storage file.
 * @param {string} file - Absolute path; the caller has made sure it may be read
 * @returns {Storage}
 * @throws {WebError} 422 saying what is wrong with the file
 */
export function readStorage(file) {
  const bad = (/** @type {string} */ why) => new WebError(422, `The storage file ${file} ${why}`);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw bad(err.code === 'ENOENT' ? 'does not exist' : `cannot be read: ${err.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw bad('must be an object like { "cookies": [], "origins": [] }');
  const list = (/** @type {any} */ value) => (Array.isArray(value) ? value : []);
  const cookies = list(data.cookies).map((cookie, i) => {
    if (!cookie?.name || !(cookie.domain || cookie.url))
      throw bad(`has a cookie without a name and a domain (cookies[${i}])`);
    const sameSite = SAME_SITE[text(cookie.sameSite).toLowerCase()];
    return {
      ...{ name: text(cookie.name), value: text(cookie.value), path: text(cookie.path || '/') },
      ...(cookie.domain ? { domain: text(cookie.domain) } : { url: text(cookie.url) }),
      ...{ secure: !!cookie.secure, httpOnly: !!cookie.httpOnly },
      ...(sameSite && { sameSite }),
      // -1 means "until the browser closes", which is every recording's lifetime.
      ...(cookie.expires > 0 && { expires: Number(cookie.expires) }),
    };
  });
  const origins = list(data.origins).map((entry, i) => {
    const url = URL.canParse(entry?.origin) ? new URL(entry.origin) : null;
    if (!url || !/^https?:$/.test(url.protocol))
      throw bad(`names an origin that is not a web address (origins[${i}].origin)`);
    const items = list(entry.localStorage)
      .filter((item) => item && typeof item.name === 'string')
      .map((item) => ({ name: item.name, value: text(item.value) }));
    return { origin: url.origin, items };
  });
  return { cookies, origins: origins.filter((entry) => entry.items.length) };
}

/**
 * Put cookies and local storage into a fresh browser, before any page loads.
 * Local storage belongs to an origin, so the tab visits each one — an empty
 * page answered from here, without touching the network.
 * @param {import('./cdp.js').Connection} connection
 * @param {import('./tab.js').Tab} tab
 * @param {Storage} storage
 */
export async function applyStorage(connection, tab, storage) {
  if (storage.cookies.length)
    await connection.send('Storage.setCookies', { cookies: storage.cookies });
  if (!storage.origins.length) return;
  const { session } = tab;
  const body = Buffer.from('<!doctype html><title></title>').toString('base64');
  const off = session.on('Fetch.requestPaused', ({ requestId }) => {
    const headers = [{ name: 'content-type', value: 'text/html' }];
    const answer = { requestId, responseCode: 200, responseHeaders: headers, body };
    session.send('Fetch.fulfillRequest', answer).catch(() => {});
  });
  try {
    for (const { origin, items } of storage.origins) {
      await session.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*` }] });
      await tab.navigate(`${origin}/`);
      const set = `for (const [k, v] of ${JSON.stringify(items.map((item) => [item.name, item.value]))}) localStorage.setItem(k, v)`;
      const why = await tab.run(set);
      if (why) throw new WebError(422, `Local storage of ${origin} could not be set: ${why}`);
    }
  } finally {
    off();
    await session.send('Fetch.disable').catch(() => {});
  }
}
