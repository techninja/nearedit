/**
 * Small templates the music editor's parts share: a labelled dropdown that
 * reports `field-change`, and a value box for one of the editor's numbers.
 * @module utils/musicUi/fieldParts
 */

import { html } from 'hybrids';
import { handleCommitInput } from '#utils/inspector/fieldEvents.js';
import { NUMBER_SPECS, options } from './choices.js';
import '#atoms/field-number/field-number.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * A dropdown that reports its choice as a `field-change` named `name`.
 * @param {string} name
 * @param {string} label - Its accessible name
 * @param {import('./choices.js').Choices} choices
 * @param {string} value
 * @param {boolean} [disabled]
 * @param {(host: any, event: Event) => void} [onChange] - Instead of reporting `field-change`
 * @returns {Template}
 */
export function select(
  name,
  label,
  choices,
  value,
  disabled = false,
  onChange = handleCommitInput,
) {
  return html`<select
    class="field-input"
    data-name="${name}"
    aria-label="${label}"
    title="${label}"
    disabled="${disabled}"
    onchange="${onChange}"
  >
    ${options(choices, value).map(
      (option) =>
        html`<option value="${option.value}" selected="${option.selected}">
          ${option.label}
        </option>`,
    )}
  </select>`;
}

/**
 * A value box for a number of a song or of a part.
 * @param {string} name - What it reports
 * @param {string} label
 * @param {number} value
 * @param {keyof typeof NUMBER_SPECS} kind - Which range, step and unit it has
 * @param {{ slider?: boolean, disabled?: boolean, compact?: boolean }} [opts]
 * @returns {Template}
 */
export function number(name, label, value, kind, opts = {}) {
  return html`<field-number
    class="${opts.compact ? 'field-number-compact' : ''}"
    name="${name}"
    label="${label}"
    caption="${label}"
    value="${value}"
    slider="${Boolean(opts.slider)}"
    disabled="${Boolean(opts.disabled)}"
    spec="${NUMBER_SPECS[kind]}"
  ></field-number>`;
}
