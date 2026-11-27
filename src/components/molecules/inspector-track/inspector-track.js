/**
 * Inspector group "Track" — shown when no clip is selected and a track has
 * the focus: its name and, for a video track, the opacity and blend mode
 * the whole track is composited with; for an audio track its volume. The
 * track's effect stack follows in the inspector. Changes leave as bubbling
 * `field-change` events named `track.*`.
 * @module components/molecules/inspector-track
 */

import { define, html } from 'hybrids';
import { BLEND_MODES } from '#utils/compose/blend.js';
import {
  handleCommitInput,
  handleLiveInput,
  handleTextKeys,
} from '#utils/inspector/fieldEvents.js';
import { specFor } from '#utils/inspector/specs.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} InspectorTrackHost
 * @property {import('#utils/inspector/trackSubject.js').TrackModel} track
 */

/** @type {import('hybrids').Component<InspectorTrackHost>} */
export default define({
  tag: 'inspector-track',
  track: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ track: model }) => {
      const { track } = model;
      if (!track) return html``;
      const slider = (/** @type {string} */ name, /** @type {string} */ label, value = 1) =>
        html`<field-number
          name="${name}"
          label="${label}"
          value="${value}"
          slider="${true}"
          spec="${specFor(name)}"
        ></field-number>`;
      return html`
        <div class="field-group-title">Track</div>
        <label class="field-row">
          <span class="field-label">Name</span>
          <input
            class="field-input"
            type="text"
            data-name="track.name"
            aria-label="Track name"
            value="${track.name}"
            oninput="${handleLiveInput}"
            onchange="${handleCommitInput}"
            onkeydown="${handleTextKeys}"
          />
        </label>
        ${model.type === 'audio'
          ? slider('track.volume', 'Volume', track.volume)
          : html`${slider('track.opacity', 'Opacity', track.opacity)}
              <label class="field-row">
                <span class="field-label">Blend</span>
                <select
                  class="field-input"
                  data-name="track.blendMode"
                  aria-label="Track blend mode"
                  onchange="${handleCommitInput}"
                >
                  ${BLEND_MODES.map(
                    (mode) =>
                      html`<option value="${mode.id}" selected="${mode.id === track.blendMode}">
                        ${mode.label}
                      </option>`,
                  )}
                </select>
              </label>`}
      `;
    },
    shadow: false,
  },
});
