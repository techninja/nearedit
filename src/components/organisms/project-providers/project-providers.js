/**
 * Provider status organism — what is set up on this server at a glance:
 * FFmpeg, transcription, visual tagging, the director's LLM. Anything
 * missing says what it would enable and where its setup is documented.
 * State: `#utils/projects/projectPage.js` (`GET /api/intelligence/status`).
 * @module components/organisms/project-providers
 */

import { html, define } from 'hybrids';
import { projectPageState, reloadStatus } from '#utils/projects/projectPage.js';
import { providerRows, setupSummary } from '#utils/projects/providers.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ProjectProvidersHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 */

/**
 * @param {import('#utils/projects/providers.js').ProviderRow} row
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectProvidersHost>}
 */
function rowTemplate(row) {
  const state = row.available ? 'ok' : row.required ? 'missing' : 'off';
  const word = row.available ? 'Ready' : row.required ? 'Missing' : 'Not set up';
  return html`
    <li class="project-providers-row project-providers-${state}" data-provider="${row.key}">
      ${row.available
        ? html`<app-icon name="success" size="sm"></app-icon>`
        : html`<app-icon name="${row.required ? 'error' : 'info'}" size="sm"></app-icon>`}
      <div class="project-providers-text">
        <span class="project-providers-head">
          <strong>${row.label}</strong>
          <span class="project-providers-state">${word}</span>
          ${row.value ? html`<span class="chip">${row.value}</span>` : html``}
        </span>
        <span class="project-providers-purpose">${row.purpose}</span>
        ${row.available
          ? html``
          : html`<span class="project-providers-setup">
              ${row.detail ? html`<em>${row.detail}.</em>` : html``} ${row.setup} See
              <code>${row.docs}</code>.
            </span>`}
      </div>
    </li>
  `;
}

/** @type {import('hybrids').Component<ProjectProvidersHost>} */
export default define({
  tag: 'project-providers',
  state: watch(projectPageState),
  render: {
    value: ({ state }) => {
      const rows = providerRows(state.status);
      const summary = setupSummary(rows);
      return html`
        <section class="app-card" aria-labelledby="project-providers-title">
          <header class="app-card-header">
            <h2 class="app-card-title" id="project-providers-title">
              <app-icon name="cpu" size="sm"></app-icon> Server setup
            </h2>
            <button
              type="button"
              class="icon-btn"
              aria-label="Check the setup again"
              title="Check again"
              onclick="${reloadStatus}"
            >
              <app-icon name="refresh" size="sm"></app-icon>
            </button>
          </header>
          ${rows.length
            ? html`<p
                  class="project-providers-summary ${summary.ok ? '' : 'project-providers-blocked'}"
                >
                  ${summary.text}
                </p>
                <ul class="project-providers-list">
                  ${rows.map(rowTemplate)}
                </ul>`
            : html`<p class="app-card-body app-muted">Checking what is set up…</p>`}
        </section>
      `;
    },
    shadow: false,
  },
});
