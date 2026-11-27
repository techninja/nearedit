/**
 * Templates for schema-driven controls: one row per parameter of a
 * generator or an effect, with the control its type asks for — a value box
 * (with a slider when the range allows), a colour field, a switch, a
 * dropdown, a text box, an image picker, or an X / Y pair for a point.
 * The descriptions come from `paramControls.js`; changes leave as
 * `field-change` events named by the control's path.
 * @module utils/inspector/paramFields
 */

import { html } from 'hybrids';
import { handleCommitInput, handleLiveInput, handleTextKeys, handleToggle } from './fieldEvents.js';
import { keyedRow } from './keyTemplates.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */
/** @typedef {import('./paramControls.js').ParamControl} ParamControl */

/**
 * @typedef {import('./keyTemplates.js').KeyContext & {
 *   images?: { path: string, name: string }[] }} ParamContext - `images`:
 *   the project's stills, for image parameters
 */

/**
 * A labelled row around a native control.
 * @param {string} label
 * @param {Template} control
 * @returns {Template}
 */
const row = (label, control) =>
  html`<label class="field-row"
    ><span class="field-label" title="${label}">${label}</span>${control}</label
  >`;

/** @type {Record<string, (control: ParamControl, ctx: ParamContext) => Template>} */
const FIELDS = {
  number: (c, ctx) =>
    html`<field-number
      name="${c.path}"
      label="${c.label}"
      value="${c.value}"
      slider="${!!c.slider}"
      disabled="${ctx.locked}"
      spec="${c.spec}"
    ></field-number>`,
  color: (c, ctx) =>
    html`<field-color
      name="${c.path}"
      label="${c.label}"
      value="${c.value || ''}"
      disabled="${ctx.locked}"
    ></field-color>`,
  boolean: (c, ctx) =>
    row(
      c.label,
      html`<span class="switch"
        ><input
          type="checkbox"
          data-name="${c.path}"
          aria-label="${c.label}"
          checked="${c.value === true}"
          disabled="${ctx.locked}"
          onchange="${handleToggle}"
      /></span>`,
    ),
  select: (c, ctx) =>
    row(
      c.label,
      html`<select
        class="field-input"
        data-name="${c.path}"
        aria-label="${c.label}"
        disabled="${ctx.locked}"
        onchange="${handleCommitInput}"
      >
        ${(c.options || []).map(
          ([value, text]) =>
            html`<option value="${value}" selected="${value === c.value}">${text}</option>`,
        )}
      </select>`,
    ),
  text: (c, ctx) =>
    row(
      c.label,
      html`<input
        class="field-input"
        type="text"
        data-name="${c.path}"
        aria-label="${c.label}"
        value="${c.value ?? ''}"
        disabled="${ctx.locked}"
        oninput="${handleLiveInput}"
        onchange="${handleCommitInput}"
        onkeydown="${handleTextKeys}"
      />`,
    ),
  image: (c, ctx) =>
    html`<field-image
      name="${c.path}"
      label="${c.label}"
      value="${c.value || ''}"
      images="${ctx.images || []}"
      disabled="${ctx.locked}"
    ></field-image>`,
  point: (c, ctx) => {
    const half = (/** @type {'x'|'y'} */ axis) =>
      html`<field-number
        class="field-number-compact"
        name="${`${c.path}.${axis}`}"
        label="${axis.toUpperCase()}"
        caption="${`${c.label} ${axis.toUpperCase()}`}"
        value="${c.value?.[axis] ?? 0.5}"
        disabled="${ctx.locked}"
        spec="${c.spec}"
      ></field-number>`;
    return html`<div class="field-row">
      <span class="field-label" title="${c.label}">${c.label}</span>
      <span class="field-pair">${half('x')}${half('y')}</span>
    </div>`;
  },
};

/**
 * The rows for a list of parameter controls.
 * @param {ParamControl[]} controls
 * @param {ParamContext} ctx
 * @returns {Template[]}
 */
export function paramFields(controls, ctx) {
  return controls.map((control) => {
    const field = (FIELDS[control.type] || FIELDS.text)(control, ctx);
    return keyedRow(ctx, control.keyPaths, control.label, field).key(control.path);
  });
}
