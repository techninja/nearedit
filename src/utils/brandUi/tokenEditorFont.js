/**
 * The token editor's template for a font token: its family among the
 * bundled ones and the kit's own, with a button to bring a font file, its
 * weight, slant and capitals, and the finer settings folded away.
 * @module utils/brandUi/tokenEditorFont
 */

import { html } from 'hybrids';
import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import { handleCommitInput } from '#utils/inspector/fieldEvents.js';
import { tokenAt } from './draft.js';
import { FONT_ACCEPT } from './fontFiles.js';
import * as on from './tokenEditorEvents.js';
import { picker, resetButton, row, toggle } from './tokenEditorParts.js';
import { FONT_FINE, fontFieldSpec } from './tokenFields.js';

/** @typedef {import('./tokenEditorEvents.js').TokenEditorHost} TokenEditorHost */
/** @typedef {import('./tokenFields.js').TokenField} TokenField */

/**
 * The weights a family can be drawn in.
 * @param {string} family
 * @param {TokenEditorHost['fonts']} fonts - The kit's own font files
 * @param {number} current - Listed whatever the family has
 * @returns {number[]} Ascending
 */
export function weightsOf(family, fonts, current) {
  const name = String(family || '').toLowerCase();
  const bundled = FONT_FAMILIES.find((entry) => entry.id.toLowerCase() === name)?.weights || [];
  const own = fonts.filter((face) => face.family.toLowerCase() === name).map((face) => face.weight);
  const all = new Set([...bundled, ...own, ...(Number.isFinite(current) ? [current] : [])]);
  return [...all].sort((a, b) => a - b);
}

/**
 * A font token: family, weight, slant, capitals, and the finer settings.
 * @param {TokenEditorHost} host
 * @param {TokenField} field
 */
export function fontBlock(host, { path, spec }) {
  const font = tokenAt(host.tokens, path) || {};
  const own = [...new Set(host.fonts.map((face) => face.family))];
  const bundled = FONT_FAMILIES.map((family) => family.id);
  const families = [...new Set([...bundled, ...own, font.family].filter(Boolean))];
  const at = (/** @type {string} */ field) => `${path}.${field}`;
  const number = (/** @type {string} */ field) => {
    const { label, min, max, step } = fontFieldSpec(field);
    return row(
      host,
      at(field),
      label,
      html`<field-number
        name="${at(field)}"
        label="${label}"
        value="${font[field] ?? fontFieldSpec(field).default}"
        spec="${{ min, max, step }}"
      ></field-number>`,
    );
  };
  return html`<fieldset class="brand-token-font" data-path="${path}">
    <legend>${spec.label} ${resetButton(host, path, spec.label)}</legend>
    <div class="field-row">
      <span class="field-label">Family</span>
      <span class="brand-token-pair">
        <select
          class="field-input"
          data-name="${at('family')}"
          aria-label="${`${spec.label}: family`}"
          onchange="${handleCommitInput}"
        >
          ${families.map(
            (family) =>
              html`<option value="${family}" selected="${family === font.family}">
                ${family}${bundled.includes(family) ? '' : ' (your file)'}
              </option>`,
          )}
        </select>
        <button
          type="button"
          class="btn btn-secondary"
          data-path="${path}"
          onclick="${on.handlePick}"
        >
          Upload a font…
        </button>
        ${picker(path, FONT_ACCEPT)}
      </span>
    </div>
    <div class="field-row">
      <span class="field-label">Weight</span>
      <span class="brand-token-pair">
        <select
          class="field-input"
          data-name="${at('weight')}"
          aria-label="${`${spec.label}: weight`}"
          onchange="${on.handleNumberChoice}"
        >
          ${weightsOf(font.family, host.fonts, font.weight).map(
            (weight) =>
              html`<option value="${weight}" selected="${weight === font.weight}">
                ${weight}
              </option>`,
          )}
        </select>
        ${toggle(at('italic'), 'Italic', font.italic)}
        ${toggle(at('upper'), 'Capitals', font.upper)}
      </span>
    </div>
    <details class="brand-token-fine">
      <summary>Fine tuning</summary>
      ${FONT_FINE.map(number)}
    </details>
  </fieldset>`.key(path);
}
