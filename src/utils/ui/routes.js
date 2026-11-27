/**
 * The app's URLs in one place: which paths exist, how to build them, and
 * how to go to one from plain code. Components link with these strings so
 * that no organism has to import a page.
 * @module utils/ui/routes
 */

export const HOME_URL = '/';

/** Path patterns of the routed views, as the router declares them. */
const KNOWN_PATHS = [/^\/$/, /^\/project\/[^/]+$/, /^\/editor\/[^/]+\/[^/]+$/];

/**
 * @param {string} projectId
 * @returns {string}
 */
export const projectUrl = (projectId) => `/project/${encodeURIComponent(projectId)}`;

/**
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {string}
 */
export const editorUrl = (projectId, adaptationId) =>
  `/editor/${encodeURIComponent(projectId)}/${encodeURIComponent(adaptationId)}`;

/**
 * Whether a path belongs to a page of the app (anything else is a 404).
 * @param {string} pathname
 * @returns {boolean}
 */
export function isKnownPath(pathname) {
  return KNOWN_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Go to a page of the app. The router follows clicks on links inside it, so
 * a link is clicked there; outside a browser, or before the router is on
 * the page, this falls back to a full page load.
 * @param {string} path - One of the URLs built above
 */
export function navigate(path) {
  const routerHost = globalThis.document?.querySelector('app-routes');
  if (!routerHost) {
    globalThis.location?.assign(path);
    return;
  }
  const link = globalThis.document.createElement('a');
  link.href = path;
  link.hidden = true;
  routerHost.append(link);
  link.click();
  link.remove();
}
