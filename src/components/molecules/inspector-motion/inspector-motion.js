/**
 * Inspector group "Ken Burns": animated pan and zoom over the clip's
 * length — an on/off switch, one-click presets, and the start and end
 * position and scale. While it is on it replaces the static position,
 * scale and crop. Changes leave as bubbling `field-change` events; a
 * preset is the field `kenBurns.preset`.
 * @module components/molecules/inspector-motion
 */

import { define, html } from 'hybrids';
import { handleButton, handleToggle } from '#utils/inspector/fieldEvents.js';
import { fieldOf, numberField } from '#utils/inspector/fieldTemplates.js';
import { KEN_BURNS_PRESETS, matchingPreset } from '#utils/inspector/kenBurns.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} InspectorMotionHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/**
 * The preset a single selected picture is using, to light up its button.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @returns {string}
 */
function activePreset(model) {
  const pictures = model.refs.filter((ref) => ref.track.type === 'video' && ref.clip.sourceFile);
  return pictures.length === 1
    ? matchingPreset(pictures[0].clip.transform.kenBurns, model.resolution)
    : '';
}

/** @type {import('hybrids').Component<InspectorMotionHost>} */
export default define({
  tag: 'inspector-motion',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (model.show?.transform !== 'full') return html``;
      const enabled = fieldOf(model, 'transform.kenBurns.enabled');
      const on = enabled.value === true && !enabled.mixed;
      const active = activePreset(model);
      const row = (/** @type {string} */ label, /** @type {string} */ edge) => html`
        <div class="field-row inspector-motion-row">
          <span class="field-label">${label}</span>
          <span class="inspector-motion-triple">
            ${numberField(model, `transform.kenBurns.${edge}X`, 'X', {
              compact: true,
              disabled: !on,
            })}
            ${numberField(model, `transform.kenBurns.${edge}Y`, 'Y', {
              compact: true,
              disabled: !on,
            })}
            ${numberField(model, `transform.kenBurns.${edge}Scale`, 'S', {
              compact: true,
              disabled: !on,
            })}
          </span>
        </div>
      `;
      return html`
        <div class="field-group-title clip-inspector-group-heading">
          <label class="switch">
            <input
              type="checkbox"
              data-name="transform.kenBurns.enabled"
              checked="${on}"
              indeterminate="${enabled.mixed}"
              disabled="${model.locked}"
              onchange="${handleToggle}"
            />
            Ken Burns
          </label>
          <button
            type="button"
            class="icon-btn"
            data-name="reset.kenBurns"
            title="Turn off and reset Ken Burns"
            aria-label="Reset Ken Burns"
            disabled="${model.locked}"
            onclick="${handleButton}"
          >
            <app-icon name="undo" size="sm"></app-icon>
          </button>
        </div>
        <div class="inspector-motion-presets" role="group" aria-label="Ken Burns presets">
          ${KEN_BURNS_PRESETS.map(
            ({ id, label, icon }) =>
              html`<button
                type="button"
                class="icon-btn"
                data-name="kenBurns.preset"
                data-value="${id}"
                aria-pressed="${active === id ? 'true' : 'false'}"
                title="${label}"
                disabled="${model.locked}"
                onclick="${handleButton}"
              >
                <app-icon name="${icon}" size="sm"></app-icon> ${label.replace('Slow ', '')}
              </button>`,
          )}
        </div>
        ${row('Start', 'start')} ${row('End', 'end')}
      `;
    },
    shadow: false,
  },
});
