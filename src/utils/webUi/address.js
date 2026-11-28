/**
 * Addresses as a person types them, and the short list of the ones used
 * last in a project. `example.com` means `https://example.com`; a machine
 * on the local network is assumed to speak plain `http`. Whether the result
 * is an address a page can be recorded from is the recipe library's
 * decision (`validateRecipe`). The list lives in `localStorage`.
 * @module utils/webUi/address
 */

import { normalizeRecipe, validateRecipe } from '#utils/web/index.js';
import { readStored, writeStored } from '#utils/ui/storage.js';

export const ADDRESSES_KEY = 'nearedit_webAddresses';
/** Addresses remembered per project. */
export const MAX_ADDRESSES = 6;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

/**
 * Read an address.
 * @param {string} text - As typed
 * @returns {{ url: string, problem: string }} `url` is '' when it cannot be
 *   used, and `problem` then says why
 */
export function readAddress(text) {
  const typed = String(text ?? '').trim();
  if (!typed) return { url: '', problem: 'Type the address of a page, like example.com' };
  // Chrome's URL parser lets a space into a host name; the server's does not.
  if (/\s/.test(typed)) return { url: '', problem: 'This is not a web address: it has a space' };
  const withScheme = SCHEME.test(typed)
    ? typed
    : `${LOCAL.test(typed) ? 'http' : 'https'}://${typed}`;
  const { url } = normalizeRecipe({ url: withScheme });
  if (url) return { url, problem: '' };
  const said = validateRecipe({ url: withScheme }).problems.find((entry) => entry.path === 'url');
  return { url: '', problem: said ? said.message : 'This is not a web address' };
}

/**
 * Put an address at the head of a list of recent ones.
 * @param {string[]} list
 * @param {string} url
 * @param {number} [max]
 * @returns {string[]} Newest first, each address once
 */
export function addRecent(list, url, max = MAX_ADDRESSES) {
  if (!url) return list;
  return [url, ...list.filter((entry) => entry !== url)].slice(0, max);
}

/**
 * @param {string} projectId
 * @returns {string[]} The addresses used last in a project, newest first
 */
export function recentAddresses(projectId) {
  const list = readStored(ADDRESSES_KEY)[projectId];
  return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : [];
}

/**
 * Remember that an address was used in a project.
 * @param {string} projectId
 * @param {string} url
 * @returns {string[]} The project's list afterwards
 */
export function rememberAddress(projectId, url) {
  const list = addRecent(recentAddresses(projectId), url);
  if (projectId) writeStored(ADDRESSES_KEY, { ...readStored(ADDRESSES_KEY), [projectId]: list });
  return list;
}
