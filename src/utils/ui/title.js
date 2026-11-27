/**
 * Document titles: "<page> · NearEdit".
 * @module utils/ui/title
 */

export const APP_NAME = 'NearEdit';

/**
 * @param {...(string|undefined|null|false)} parts - Most specific first; empty parts are skipped
 * @returns {string}
 */
export function pageTitle(...parts) {
  return [...parts.filter(Boolean), APP_NAME].join(' · ');
}

/**
 * Set the browser tab's title.
 * @param {...(string|undefined|null|false)} parts
 */
export function setPageTitle(...parts) {
  if (globalThis.document) globalThis.document.title = pageTitle(...parts);
}
