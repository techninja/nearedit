/**
 * What the transcript panel fetches and where it scrolls: the sidecar of
 * the file on screen, the provider status that explains a missing
 * transcript, and bringing a word into view.
 * @module utils/transcript/panelLoad
 */

import { intelligenceStatus } from '#utils/media/analyze.js';
import { loadSidecar } from '#utils/media/sidecars.js';

/** @typedef {import('./panelContext.js').Host} Host */

/**
 * Fetch the sidecar of the file the panel shows.
 * @param {Host} host
 * @param {boolean} [refresh] - Skip the cache
 */
export function loadTranscript(host, refresh = false) {
  const file = host.file;
  if (!file) return;
  host.loading = !Object.keys(host.sidecar).length;
  loadSidecar(file, { refresh })
    .then((sidecar) => {
      if (host.file !== file) return;
      Object.assign(host, { sidecar: sidecar || {}, loading: false });
    })
    .catch((err) => {
      if (host.file === file) Object.assign(host, { loading: false, message: err.message });
    });
}

/**
 * Learn which providers are usable, to explain a missing transcript.
 * @param {Host} host
 */
export function loadStatus(host) {
  intelligenceStatus()
    .then((status) => host.status !== status && (host.status = status))
    .catch((err) => console.warn('[transcript] provider status is unknown:', err.message));
}

/**
 * Bring a unit into view inside the scrolling body, without moving any
 * other scroll container.
 * @param {Host} host
 * @param {number} index
 */
export function revealUnit(host, index) {
  requestAnimationFrame(() => {
    const body = host.querySelector('.transcript-panel-body');
    const word = /** @type {HTMLElement|null} */ (host.querySelector(`[data-i="${index}"]`));
    if (!body || !word) return;
    const top = word.getBoundingClientRect().top - body.getBoundingClientRect().top;
    if (top < 8 || top > body.clientHeight - 32) body.scrollTop += top - body.clientHeight / 3;
  });
}
