/**
 * Template for a parameter list in sections (`paramSections.js`): each
 * titled section opens and closes, and says how many of its parameters
 * are set to something other than their default.
 * @module utils/inspector/sectionFields
 */

import { html } from 'hybrids';
import { paramFields } from './paramFields.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * The rows of a parameter list, in sections that open and close when the
 * list is long (`paramSections.js`). The first section starts open; a
 * section says how many of its parameters are set.
 * @param {import('./paramSections.js').ParamSection[]} sections
 * @param {import('./paramFields.js').ParamContext} ctx
 * @returns {Template[]}
 */
export function paramSectionFields(sections, ctx) {
  return sections.map((part, index) => {
    const rows = paramFields(part.controls, ctx);
    if (!part.title) return html`${rows}`;
    return html`<details class="inspector-section param-section" open="${index === 0}">
      <summary class="field-group-title">
        <span>${part.title}</span>
        ${part.changed ? html`<span class="chip">${part.changed} set</span>` : html``}
      </summary>
      ${rows}
    </details>`.key(part.controls[0].path);
  });
}
