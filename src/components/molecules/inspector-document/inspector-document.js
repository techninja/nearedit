/**
 * What the inspector shows when nothing is selected: the open project and
 * the document at a glance — format, length, and what is on each track.
 * Read-only.
 * @module components/molecules/inspector-document
 */

import { define, html } from 'hybrids';
import { formatTimecode } from '#utils/playback/timecode.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} InspectorDocumentHost
 * @property {import('#utils/inspector/summary.js').DocumentSummary} summary
 * @property {string} project - Project name
 * @property {string} adaptation - Adaptation name
 */

const KIND_LABELS = {
  video: 'video',
  audio: 'audio',
  image: 'still',
  title: 'title',
  generator: 'generator',
  element: 'brand element',
  placeholder: 'placeholder',
};

/**
 * @param {string} label
 * @param {string|number} value
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorDocumentHost>}
 */
function fact(label, value) {
  return html`<div class="field-row">
    <span class="field-label">${label}</span><span class="inspector-document-value">${value}</span>
  </div>`;
}

/**
 * @param {Record<string, number>} kinds
 * @returns {string} e.g. `3 video, 2 audio, 1 title`
 */
function clipWords(kinds) {
  const parts = Object.entries(kinds)
    .filter(([, count]) => count > 0)
    .map(
      ([kind, count]) =>
        `${count} ${KIND_LABELS[kind]}${kind === 'element' && count > 1 ? 's' : ''}`,
    );
  return parts.join(', ') || 'none yet';
}

/** @type {import('hybrids').Component<InspectorDocumentHost>} */
export default define({
  tag: 'inspector-document',
  summary: { value: /** @type {any} */ ({}) },
  project: '',
  adaptation: '',
  render: {
    value: ({ summary, project, adaptation }) => {
      if (!summary.tracks) return html``;
      return html`
        <div class="field-group-title">Document</div>
        ${project && fact('Project', project)} ${adaptation && fact('Edit', adaptation)}
        ${fact('Format', `${summary.resolution} · ${summary.fps} fps`)}
        ${fact('Duration', formatTimecode(summary.duration, summary.fps))}
        ${fact('Clips', clipWords(summary.kinds))} ${fact('Markers', summary.markers)}
        <div class="field-group-title">Tracks</div>
        <ul class="inspector-document-tracks">
          ${summary.tracks.map(
            (track) =>
              html`<li>
                <app-icon name="${track.type === 'audio' ? 'volume' : 'film'}" size="sm"></app-icon>
                <span class="inspector-document-name">${track.name}</span>
                ${track.locked && html`<span class="chip">locked</span>`}
                ${track.muted && html`<span class="chip">muted</span>`}
                ${track.solo && html`<span class="chip">solo</span>`}
                <span class="inspector-document-count"
                  >${track.clips} ${track.clips === 1 ? 'clip' : 'clips'}</span
                >
              </li>`,
          )}
        </ul>
        <p class="inspector-document-hint">Select a clip to see and edit its properties.</p>
      `;
    },
    shadow: false,
  },
});
