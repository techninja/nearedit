/**
 * Inspector group "Generator": what a generator clip draws — its type
 * (switching starts from the new type's defaults), the presets its module
 * exports, the seed with a shuffle button, and its parameters as controls
 * built from the catalog schema. Changes leave as bubbling `field-change`
 * events: `generator.type`, `generator.preset`, `generator.seed`,
 * `generator.params.<name>` and `reset.generator`.
 * @module components/molecules/inspector-generator
 */

import { define, html } from 'hybrids';
import { generatorModule } from '#utils/compose/catalog.js';
import { presetsOf } from '#utils/create/presets.js';
import { emitChange } from '#utils/inspector/fieldEvents.js';
import { numberField } from '#utils/inspector/fieldTemplates.js';
import { typeRow } from '#utils/inspector/generatorTemplates.js';
import { groupHeading } from '#utils/inspector/groupTemplates.js';
import { imageChoices } from '#utils/inspector/imageChoices.js';
import { contextOf, keyed } from '#utils/inspector/keyTemplates.js';
import { shownClip } from '#utils/inspector/model.js';
import { paramControls } from '#utils/inspector/paramControls.js';
import { paramSectionFields } from '#utils/inspector/sectionFields.js';
import { paramSections } from '#utils/inspector/paramSections.js';
import { targetsOf } from '#utils/inspector/targets.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-image/field-image.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/**
 * @typedef {Object} InspectorGeneratorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** A new seed: the same generator, differently random. @param {InspectorGeneratorHost & HTMLElement} host */
function handleShuffle(host) {
  emitChange(host, 'generator.seed', Math.floor(Math.random() * 1_000_000));
}

/** A preset was chosen. @param {InspectorGeneratorHost & HTMLElement} host @param {Event} event */
function handlePreset(host, event) {
  const select = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  const [ref] = targetsOf(host.model.refs, 'generator.seed');
  const preset = presetsOf(generatorModule(ref?.clip.generator.type)).find(
    (entry) => entry.id === select.value,
  );
  select.value = '';
  if (preset) emitChange(host, 'generator.preset', { params: preset.params, seed: preset.seed });
}

/** @type {import('hybrids').Component<InspectorGeneratorHost>} */
export default define({
  tag: 'inspector-generator',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.show?.generator) return html``;
      const refs = targetsOf(model.refs, 'generator.seed');
      const heading = groupHeading(
        'Generator',
        'reset.generator',
        model.locked,
        'Back to defaults',
      );
      if (refs.length !== 1) {
        return html`${heading}
          <p class="inspector-generator-note">
            ${refs.length} generators are selected. Select one to change what it draws.
          </p>`;
      }
      const clip = shownClip(refs[0].clip, model.time);
      const { type, params } = clip.generator;
      const module = generatorModule(type);
      const presets = presetsOf(module);
      const context = { ...contextOf(model, 'generator.seed'), images: imageChoices() };
      const controls = paramControls(module?.params, params, 'generator.params');
      return html`
        ${heading} ${keyed(model, [], 'Type', typeRow(type, Boolean(module), model.locked))}
        ${presets.length
          ? keyed(
              model,
              [],
              'Preset',
              html`<label class="field-row">
                <span class="field-label">Preset</span>
                <select
                  class="field-input"
                  aria-label="Apply a preset"
                  disabled="${model.locked}"
                  onchange="${handlePreset}"
                >
                  <option value="" selected>Apply a preset…</option>
                  ${presets.map(
                    (preset) => html`<option value="${preset.id}">${preset.label}</option>`,
                  )}
                </select>
              </label>`,
            )
          : html``}
        ${keyed(
          model,
          ['generator.seed'],
          'Seed',
          html`<div class="inspector-generator-seed">
            ${numberField(model, 'generator.seed', 'Seed')}
            <button
              type="button"
              class="icon-btn"
              title="Shuffle: another random seed"
              aria-label="Shuffle the seed"
              disabled="${model.locked}"
              onclick="${handleShuffle}"
            >
              <app-icon name="refresh" size="sm"></app-icon>
            </button>
          </div>`,
        )}
        ${paramSectionFields(
          paramSections(controls, refs[0].clip.generator.params, module?.params),
          context,
        )}
      `;
    },
    shadow: false,
  },
});
