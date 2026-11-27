/**
 * Inspector group "Timing": where the clip sits on the timeline and which
 * part of its source it plays, as timecode; fades; and volume for sound.
 * Start moves the clip, End and Duration trim its end, Source in slips it.
 * Changes leave as bubbling `field-change` events.
 * @module components/molecules/inspector-timing
 */

import { define, html } from 'hybrids';
import { numberField } from '#utils/inspector/fieldTemplates.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import '#atoms/field-number/field-number.js';

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
        ${model.show.volume && numberField(model, 'volume', 'Volume', { slider: true })}
      `;
    },
    shadow: false,
  },
});
