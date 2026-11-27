/**
 * Details of one media file for the quick look: the facts, what has been
 * analysed (and what cannot be, and why), tags, description and — for
 * speech — the start of the transcript. Asks for work with bubbling
 * events: `media-analyze` (`{ paths }`) and `media-transcript` (`{ path }`).
 * @module components/molecules/media-details
 */

import { define, dispatch, html } from 'hybrids';
import { analysisBadges } from '#utils/media/analysis.js';
import { NO_ITEM, formatSize, metaParts } from '#utils/media/format.js';
import { loadSidecar, onSidecarChange } from '#utils/media/sidecars.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaDetailsHost
 * @property {import('#utils/media/library.js').MediaItem} item
 * @property {Record<string, any>} status - GET /intelligence/status ({} while unknown)
 * @property {Record<string, any>} sidecar - The file's analysis data ({} until loaded)
 * @property {boolean} busy - An analysis job is running: no new one can start
 */

/** @typedef {MediaDetailsHost & HTMLElement} Host */

const SNIPPET_CHARS = 220;
const STATE_WORDS = { done: 'ready', missing: 'not analysed yet', unavailable: 'no provider' };

/** @param {Host} host */
function load(host) {
  const path = host.item.filePath;
  if (!path) return;
  loadSidecar(path)
    .then((sidecar) => {
      if (host.item.filePath === path) host.sidecar = sidecar || {};
    })
    .catch((err) => console.warn('[media-details] could not load the sidecar:', err.message));
}

/**
 * The start of what is said (or written) in a file.
 * @param {Record<string, any>} sidecar
 * @returns {string}
 */
function snippet(sidecar) {
  const phrases = (sidecar.segments || []).map((/** @type {any} */ s) => s.text);
  const words = (sidecar.transcript || []).map((/** @type {any} */ w) => String(w.word).trim());
  const text = (phrases.length ? phrases : words).join(' ') || sidecar.content || '';
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS).trimEnd()}…` : text;
}

/** @param {Host} host */
function handleAnalyze(host) {
  dispatch(host, 'media-analyze', { detail: { paths: [host.item.filePath] }, bubbles: true });
}

/** @param {Host} host */
function handleTranscript(host) {
  dispatch(host, 'media-transcript', { detail: { path: host.item.filePath }, bubbles: true });
}

/** @type {import('hybrids').Component<MediaDetailsHost>} */
export default define({
  tag: 'media-details',
  item: { value: NO_ITEM, observe: load },
  status: { value: {} },
  sidecar: { value: {}, connect: (host) => onSidecarChange(() => load(host)) },
  busy: false,
  render: {
    value: ({ item, status, sidecar, busy }) => {
      if (!item.filePath) return html``;
      const badges = analysisBadges(item, Object.keys(status).length ? status : null);
      const tags = item.tags?.length ? item.tags : sidecar.tags || [];
      const text = snippet(sidecar);
      const spoken = item.analysis?.transcript && item.type !== 'text';
      return html`
        <div class="media-details">
          <div class="media-details-name">${item.filename}</div>
          <div class="media-details-facts">
            ${[item.type, ...metaParts(item), formatSize(item.size)]
              .filter((fact) => fact && fact !== 'text')
              .map((fact) => html`<span class="chip">${fact}</span>`)}
          </div>
          ${tags.length > 0 &&
          html`<div class="media-details-tags">
            ${tags.map((tag) => html`<span class="chip media-details-tag">${tag}</span>`)}
          </div>`}
          ${sidecar.description && html`<p class="media-details-text">${sidecar.description}</p>`}
          ${text &&
          html`<p class="media-details-text media-details-quote">
            ${text}
            ${spoken &&
            html`<button type="button" class="icon-btn" onclick="${handleTranscript}">
              <app-icon name="text-edit" size="sm"></app-icon> Open transcript
            </button>`}
          </p>`}
          ${badges.length > 0 &&
          html`<ul class="media-details-analysis">
            ${badges.map(
              (badge) => html`
                <li class="media-details-${badge.state}">
                  <app-icon name="${badge.icon}" size="sm"></app-icon>
                  <span>${badge.label}</span>
                  <span class="media-details-state">${STATE_WORDS[badge.state]}</span>
                </li>
              `,
            )}
            <li>
              <button
                type="button"
                class="icon-btn media-details-analyze"
                disabled="${busy}"
                onclick="${handleAnalyze}"
              >
                <app-icon name="scan" size="sm"></app-icon> Analyse this file
              </button>
            </li>
          </ul>`}
        </div>
      `;
    },
    shadow: false,
  },
});
