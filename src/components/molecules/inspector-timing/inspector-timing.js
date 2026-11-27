/**
 * Inspector group "Timing": where the clip sits on the timeline and which
 * part of its source it plays, as timecode; fades with the shape of each;
 * and, for sound, the volume with its keyframe button (a keyframed volume
 * is a volume envelope). Start moves the clip, End and Duration trim its
 * end, Source in slips it. Changes leave as bubbling `field-change` events.
 * @module components/molecules/inspector-timing
 */

import { define, html } from 'hybrids';
import { FADE_CURVES } from '#utils/edl/defaults.js';
import { handleCommitInput } from '#utils/inspector/fieldEvents.js';
import { fieldOf, numberField } from '#utils/inspector/fieldTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import { humanize } from '#utils/keyframes/labels.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/**
 * @typedef {Object} InspectorTimingHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/**
 * A read-only timecode row.
 * @param {string} label
 * @param {number} seconds
 * @param {number} fps
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTimingHost>}
 */
function readout(label, seconds, fps) {
  return html`<div class="field-row">
    <span class="field-label">${label}</span>
    <output class="inspector-timing-readout">${formatTimecode(seconds, fps)}</output>
  </div>`;
}

/**
 * A dropdown for the shape of one fade.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @param {'fadeInCurve'|'fadeOutCurve'} name
 * @param {string} label
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTimingHost>}
 */
function curveSelect(model, name, label) {
  const field = fieldOf(model, name);
  return html`<select
    class="field-input"
    data-name="${name}"
    aria-label="${label}"
    title="${label}"
    disabled="${model.locked}"
    onchange="${handleCommitInput}"
  >
    ${field.mixed ? html`<option value="" selected disabled>Mixed</option>` : html``}
    ${FADE_CURVES.map(
      (curve) =>
        html`<option value="${curve}" selected="${!field.mixed && curve === field.value}">
          ${humanize(curve)}
        </option>`,
    )}
  </select>`;
}

/** @type {import('hybrids').Component<InspectorTimingHost>} */
export default define({
  tag: 'inspector-timing',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.count) return html``;
      const { timing, fps, fadeLocks } = model;
      const time = { kind: /** @type {'time'} */ ('time'), fps };
      const length = { ...time, min: 1 / fps };
      const timeField = (
        /** @type {string} */ name,
        /** @type {string} */ label,
        /** @type {number} */ value,
        spec = time,
      ) => numberField(model, name, label, { value, mixed: false, spec });
      return html`
        <div class="field-group-title">Timing</div>
        ${timing.single
          ? html`${timeField('timing.start', 'Start', timing.start)}
            ${timeField('timing.end', 'End', timing.end, length)}
            ${timeField('timing.duration', 'Duration', timing.duration, length)}
            ${timing.timed &&
            html`${timeField('timing.sourceIn', 'Source in', timing.sourceIn)}
            ${readout('Source out', timing.sourceOut, fps)}`}`
          : html`${readout('First starts', timing.start, fps)}
            ${readout('Last ends', timing.end, fps)} ${readout('Span', timing.duration, fps)}`}
        <div class="field-row">
          <span
            class="field-label"
            title="${fadeLocks.in || fadeLocks.out
              ? 'A cross-fade is set by the overlap: move or trim the clip to change it'
              : ''}"
            >Fades${fadeLocks.in || fadeLocks.out ? ' (cross-fade)' : ''}</span
          >
          <span class="field-pair">
            ${numberField(model, 'fadeIn', 'In', { compact: true, disabled: fadeLocks.in })}
            ${numberField(model, 'fadeOut', 'Out', { compact: true, disabled: fadeLocks.out })}
          </span>
        </div>
        <div class="field-row">
          <span class="field-label" title="How each fade moves from one level to the other"
            >Fade shape</span
          >
          <span class="field-pair">
            ${curveSelect(model, 'fadeInCurve', 'Shape of the fade in')}
            ${curveSelect(model, 'fadeOutCurve', 'Shape of the fade out')}
          </span>
        </div>
        ${model.show.volume
          ? html`<div class="field-group-title">Sound</div>
              ${keyed(
                model,
                ['volume'],
                'Volume',
                numberField(model, 'volume', 'Volume', { slider: true }),
              )}`
          : html``}
      `;
    },
    shadow: false,
  },
});
