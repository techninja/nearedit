/**
 * Template of the generator inspector's type switch: every generator of
 * the catalog, grouped by category.
 * @module utils/inspector/generatorTemplates
 */

import { html } from 'hybrids';
import { GENERATORS } from '#utils/compose/catalog.js';
import { groupByCategory } from '#utils/create/catalogView.js';
import { handleCommitInput } from './fieldEvents.js';

/**
 * A dropdown that reports `generator.type`.
 * @param {string} type - The clip's generator type
 * @param {boolean} known - The catalog has that type
 * @param {boolean} locked
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function typeRow(type, known, locked) {
  return html`<label class="field-row">
    <span class="field-label">Type</span>
    <select
      class="field-input"
      data-name="generator.type"
      aria-label="Generator type"
      disabled="${locked}"
      onchange="${handleCommitInput}"
    >
      ${known ? html`` : html`<option value="${type}" selected>${type} (unknown)</option>`}
      ${groupByCategory(/** @type {any[]} */ (GENERATORS)).map(
        (group) =>
          html`<optgroup label="${group.label}">
            ${group.items.map(
              (entry) =>
                html`<option value="${entry.type}" selected="${entry.type === type}">
                  ${entry.label}
                </option>`,
            )}
          </optgroup>`,
      )}
    </select>
  </label>`;
}
