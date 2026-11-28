/**
 * Inspector group "Cut out person" — for selected video clips: the switch
 * that draws a clip as the person alone, where the cutout stands (being
 * made, with progress and a cancel; failed or cancelled, with a retry;
 * impossible on this server, with what is missing and how to get it),
 * remove or blur the background, the edge settings, one-click placements
 * (full height at a side, a lower corner, a circle in a corner) and a
 * shadow and an outline. With several clips selected the switch and the
 * settings apply to all of them. The cutout itself is made by the
 * lifecycle in `#utils/cutoutUi/runtime.js`; this group only edits the
 * document and shows the state.
 * @module components/molecules/cutout-inspector
 */

import { define, html } from 'hybrids';
import { ensureAvailability } from '#utils/cutoutUi/availability.js';
import * as on from '#utils/cutoutUi/inspectorEvents.js';
import { modeRow, placeRows } from '#utils/cutoutUi/inspectorParts.js';
import { cutoutView, subjectsOf } from '#utils/cutoutUi/inspectorView.js';
import { cutoutJobs } from '#utils/cutoutUi/state.js';
import { missingNote, statusRow } from '#utils/cutoutUi/statusParts.js';
import { paramFields } from '#utils/inspector/paramFields.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/cutout-place/cutout-place.js';
import '#atoms/field-number/field-number.js';

/** @typedef {import('#utils/cutoutUi/inspectorEvents.js').CutoutInspectorHost} CutoutInspectorHost */

/**
 * The first time the group shows for footage, the server is asked whether
 * it can make cutouts at all: the group says so before anybody switches one on.
 * @param {HTMLElement} _host
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 */
function askOnce(_host, model) {
  if (subjectsOf(model).length) ensureAvailability();
}

/** @type {import('hybrids').Component<CutoutInspectorHost>} */
export default define({
  tag: 'cutout-inspector',
  model: { value: /** @type {any} */ ({}), observe: askOnce },
  jobs: watch(cutoutJobs),
  render: {
    value: ({ model, jobs }) => {
      const view = cutoutView(model, jobs, on.sourceSize);
      if (!view) return html``;
      const locked = Boolean(model.locked);
      const context = { clips: [], time: model.time, fps: model.fps, locked };
      const some = view.on || view.mixed;
      return html`
        <div class="cutout-inspector" onfield-change="${on.handleField}">
          <label class="field-group-title cutout-inspector-head">
            <span>Cut out person</span>
            <span class="switch">
              <input
                type="checkbox"
                role="switch"
                aria-label="Cut out person"
                checked="${view.on}"
                indeterminate="${view.mixed}"
                disabled="${locked}"
                onchange="${on.handleSwitch}"
              />
            </span>
          </label>
          ${some
            ? html`
                ${view.files.map((file) => statusRow(file, view.files.length > 1).key(file.path))}
                ${modeRow(view, locked)} ${paramFields(view.controls, context)}
                ${placeRows(view, locked)}
              `
            : html`<p class="cutout-inspector-hint">
                Keeps only the person, so the tracks below show behind them. Made once, in the
                background — a few minutes for each minute of footage.
              </p>`}
          ${missingNote(jobs.availability)}
        </div>
      `;
    },
    shadow: false,
  },
});
