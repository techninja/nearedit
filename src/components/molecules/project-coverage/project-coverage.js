/**
 * Analysis coverage molecule — one bar per analysis step: how many of the
 * files it applies to have been done. A step that cannot progress because
 * its provider is not set up says so.
 * @module components/molecules/project-coverage
 */

import { html, define } from 'hybrids';
import { coveragePercent } from '#utils/projects/coverage.js';

/**
 * @typedef {Object} ProjectCoverageHost
 * @property {import('#utils/projects/coverage.js').CoverageRow[]} rows
 * @property {Record<string, { available?: boolean }>} status - Provider status
 */

/**
 * @param {import('#utils/projects/coverage.js').CoverageRow} row
 * @param {Record<string, { available?: boolean }>} status
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectCoverageHost>}
 */
function rowTemplate(row, status) {
  const incomplete = row.done < row.total;
  const blocked = incomplete && row.provider && status[row.provider]?.available === false;
  return html`
    <li class="project-coverage-step" data-step="${row.key}" title="${row.hint}">
      <span class="project-coverage-name">${row.label}</span>
      <span
        class="progress"
        role="img"
        aria-label="${`${row.label}: ${row.done} of ${row.total} files`}"
      >
        <span class="progress-bar" style="${{ width: `${coveragePercent(row)}%` }}"></span>
      </span>
      <span class="project-coverage-count">${row.done}/${row.total}</span>
      ${blocked
        ? html`<span class="project-coverage-note">Needs a provider — see “Server setup”</span>`
        : html``}
    </li>
  `.key(row.key);
}

/** @type {import('hybrids').Component<ProjectCoverageHost>} */
export default define({
  tag: 'project-coverage',
  rows: { value: [] },
  status: { value: {} },
  render: {
    value: ({ rows, status }) => html`
      <ul class="project-coverage">
        ${rows.map((row) => rowTemplate(row, status || {}))}
      </ul>
    `,
    shadow: false,
  },
});
