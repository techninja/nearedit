/**
 * Templates of the inspector's "Brand element" group
 * (`<element-inspector>`): one blank as a field, and how the selection
 * stands with the project's brand — with the buttons that update it.
 * @module utils/brandUi/inspectorParts
 */

import { html } from 'hybrids';
import * as on from './inspectorEvents.js';
import { elementsWord } from './stale.js';

/**
 * One blank as a field: a line, or a few for longer text.
 * @param {import('#utils/brandUi/elementSubject.js').SlotField} field
 * @param {boolean} locked
 */
export function slotField(field, locked) {
  const empty = !field.mixed && !field.value.trim() && !field.optional;
  const common = {
    placeholder: field.mixed ? 'Mixed' : field.optional ? 'Optional' : field.sample,
    title: field.optional ? `${field.label} — may be left empty` : field.label,
  };
  const box =
    field.lines > 1
      ? html`<textarea
          class="field-input"
          rows="${field.lines}"
          data-slot="${field.name}"
          aria-label="${field.label}"
          aria-invalid="${empty ? 'true' : 'false'}"
          maxlength="${field.max || 2000}"
          placeholder="${common.placeholder}"
          title="${common.title}"
          value="${field.value}"
          disabled="${locked}"
          oninput="${on.handleSlotInput}"
          onchange="${on.handleSlotCommit}"
          onkeydown="${on.handleSlotKeys}"
        ></textarea>`
      : html`<input
          class="field-input"
          type="text"
          data-slot="${field.name}"
          aria-label="${field.label}"
          aria-invalid="${empty ? 'true' : 'false'}"
          maxlength="${field.max || 2000}"
          placeholder="${common.placeholder}"
          title="${common.title}"
          value="${field.value}"
          disabled="${locked}"
          oninput="${on.handleSlotInput}"
          onchange="${on.handleSlotCommit}"
          onkeydown="${on.handleSlotKeys}"
        />`;
  return html`<label class="field-row">
    <span class="field-label">${field.label}</span>${box}
  </label>`.key(field.name);
}

/**
 * How the selection stands with the project's brand, and what can be done.
 * @param {import('#utils/brandUi/elementSubject.js').ElementSubject} subject
 * @param {number} everywhere - Out-of-date clips on the whole timeline
 */
export function standing(subject, everywhere) {
  const { outdated, missing, clipIds, locked } = subject;
  if (!outdated.length && !missing.length) {
    return html`<p class="element-inspector-current">
      <app-icon name="check" size="sm"></app-icon> Matches the brand
    </p>`;
  }
  const many = clipIds.length > 1;
  return html`<div class="brand-stale element-inspector-stale" role="status">
    ${outdated.length
      ? html`<p>
            <strong>Out of date.</strong>
            ${many ? `${elementsWord(outdated.length)} were` : 'This was'} made from an earlier
            brand. Updating replaces the look and keeps the text, the place and the timing.
          </p>
          <span class="element-inspector-buttons">
            <button
              type="button"
              class="btn btn-primary"
              data-action="update"
              disabled="${locked}"
              onclick="${on.handleUpdate}"
            >
              Update to brand
            </button>
            ${everywhere > outdated.length
              ? html`<button
                  type="button"
                  class="btn btn-secondary"
                  data-action="update-all"
                  onclick="${on.handleUpdateAll}"
                >
                  Update all ${everywhere}
                </button>`
              : html``}
          </span>`
      : html``}
    ${missing.length
      ? html`<p class="brand-stale-more">
          ${many ? `${elementsWord(missing.length)} are` : 'This element is'} not in the project’s
          brand: ${many ? 'they keep' : 'it keeps'} the look ${many ? 'they have' : 'it has'}.
        </p>`
      : html``}
  </div>`;
}
