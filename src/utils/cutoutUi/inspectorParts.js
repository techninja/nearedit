/**
 * The settings half of the inspector's "Cut out person" group as template
 * functions: remove or blur the background, the placement buttons and the
 * looks. `<cutout-inspector>` puts them together with the status rows
 * (`statusParts.js`).
 * @module utils/cutoutUi/inspectorParts
 */

import { html } from 'hybrids';
import * as on from './inspectorEvents.js';
import { PLACEMENTS } from './placements.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */
/** @typedef {import('./inspectorView.js').CutoutView} CutoutView */

const MODES = [
  ['remove', 'Remove', 'Only the person shows: the tracks below are the background'],
  ['blur', 'Blur', 'The person stays sharp over their own background, blurred'],
];

/**
 * Remove the background, or blur it.
 * @param {CutoutView} view
 * @param {boolean} locked
 * @returns {Template}
 */
export function modeRow(view, locked) {
  return html`<div class="field-row">
    <span class="field-label">Background</span>
    <span class="seg" role="group" aria-label="Background">
      ${MODES.map(
        ([value, label, hint]) =>
          html`<button
            type="button"
            data-value="${value}"
            title="${hint}"
            aria-pressed="${String(view.mode === value)}"
            disabled="${locked}"
            onclick="${on.handleMode}"
          >
            ${label}
          </button>`,
      )}
    </span>
  </div>`;
}

/**
 * The one-click placements, each a small picture of the frame, and the looks.
 * @param {CutoutView} view
 * @param {boolean} locked
 * @returns {Template}
 */
export function placeRows(view, locked) {
  return html`
    <div class="field-row">
      <span class="field-label">Place</span>
      <span class="cutout-inspector-places" role="group" aria-label="Placement">
        ${PLACEMENTS.map(
          (place) =>
            html`<cutout-place
              data-place="${place.id}"
              place="${place.id}"
              label="${place.label}"
              hint="${place.hint}"
              pressed="${view.placement === place.id}"
              disabled="${locked}"
              onclick="${on.handlePlacement}"
            ></cutout-place>`,
        )}
      </span>
    </div>
    ${view.placement.startsWith('circle') && view.mode === 'remove'
      ? html`<p class="cutout-inspector-hint">
          In a round window, Blur keeps the person’s own background behind them.
        </p>`
      : html``}
    ${view.looks.length
      ? html`<div class="field-row">
          <span class="field-label">Finish</span>
          <span class="cutout-inspector-looks">
            ${view.looks.map(
              (look) =>
                html`<button
                  type="button"
                  class="btn btn-secondary"
                  data-look="${look.id}"
                  title="${look.hint}"
                  aria-pressed="${String(look.pressed)}"
                  disabled="${locked}"
                  onclick="${on.handleLook}"
                >
                  ${look.label}
                </button>`,
            )}
          </span>
        </div>`
      : html``}
  `;
}
