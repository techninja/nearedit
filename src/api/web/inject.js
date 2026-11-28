/**
 * The script the recorder plants in every page: the helpers of `page/`,
 * turned into text. It runs in a JavaScript world of its own (an "isolated
 * world", as extensions use): it sees the same DOM as the page, but none of
 * the page's variables, and whatever the page's scripts redefine —
 * `Array.prototype`, `document.querySelector` — is untouched here.
 * @module api/web/inject
 */

import { installFrame } from './page/frame.js';
import { installGeometry } from './page/geometry.js';
import { installMarks } from './page/marks.js';
import { installOverlay } from './page/overlay.js';
import { installElements } from './page/elements.js';
import { installSelector } from './page/selector.js';
import { installSight } from './page/sight.js';
import { installTargets } from './page/targets.js';

/** Name of the recorder's world, and of its namespace there. */
export const WORLD = 'nearedit';
export const NAMESPACE = '__nearedit';

const PARTS = [
  installTargets,
  installSight,
  installGeometry,
  installOverlay,
  installMarks,
  installFrame,
  installSelector,
  installElements,
];

/** Runs when a document is created; only the page itself gets helpers, not its frames. */
export const PAGE_SCRIPT = `(() => {
  if (globalThis.${NAMESPACE} || window !== window.top) return;
  const ne = {};
  ${PARTS.map((part) => `(${part})(ne);`).join('\n  ')}
  globalThis.${NAMESPACE} = ne;
})();`;

/**
 * Runs in the page's own world before its scripts: recordings start from a
 * fresh profile every time, so a service worker could only serve stale
 * pages to a later step. Registration fails the way it does in a browser
 * that has them switched off.
 */
export const NO_SERVICE_WORKERS = `(() => {
  const container = globalThis.navigator && navigator.serviceWorker;
  if (!container) return;
  const refuse = () => Promise.reject(new DOMException('Service workers are off while recording', 'SecurityError'));
  try { Object.defineProperty(container, 'register', { value: refuse, configurable: true }); } catch (e) { void e; }
})();`;

/**
 * An expression that calls a helper.
 * @param {string} name - `frame`, `resolve`…
 * @param {...any} args - JSON-safe
 * @returns {string}
 */
export function helperCall(name, ...args) {
  const written = args.map((arg) => (arg === undefined ? 'undefined' : JSON.stringify(arg)));
  return `${NAMESPACE}.${name}(${written.join(', ')})`;
}
