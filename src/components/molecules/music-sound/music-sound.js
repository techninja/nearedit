/**
 * Sound panel of the music editor — how the open part sounds. A synth
 * part: its preset (by category), a transposition, then every parameter
 * of the synth as a control, generated from the engine's schema
 * (`SYNTH_PARAMS`) and grouped as the schema says; a parameter the part
 * changed can be reset, one group or all of them. A drum part: its kit.
 * Reports `field-change` named after the part's fields (`preset`,
 * `params.cutoff`, `kit`…).
 * @module components/molecules/music-sound
 */

import { define, html } from 'hybrids';
import { handleButton, handleCommitInput } from '#utils/inspector/fieldEvents.js';
import { paramSectionFields } from '#utils/inspector/sectionFields.js';
import { KITS } from '#utils/music/catalog/kits.js';
import { PRESETS } from '#utils/music/catalog/presets.js';
import { KIT_CHOICES } from '#utils/musicUi/choices.js';
import { number, select } from '#utils/musicUi/fieldParts.js';
import { hasOwnParams, presetGroups, soundSections } from '#utils/musicUi/soundEdit.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} MusicSoundHost
 * @property {any} shown - The open part (`part` is taken: an element has one)
 * @property {boolean} locked
 */

/** @param {any} part @param {boolean} locked */
function synth(part, locked) {
  const ctx = { clips: [], time: 0, fps: 30, locked };
  return html`
    <label class="field-row">
      <span class="field-label">Preset</span>
      <select
        class="field-input"
        data-name="preset"
        aria-label="Preset"
        disabled="${locked}"
        onchange="${handleCommitInput}"
      >
        ${presetGroups().map(
          (group) =>
            html`<optgroup label="${group.label}">
              ${group.presets.map(
                (preset) =>
                  html`<option value="${preset.name}" selected="${preset.name === part.preset}">
                    ${preset.label}
                  </option>`,
              )}
            </optgroup>`,
        )}
      </select>
    </label>
    <p class="music-sound-about">${PRESETS[part.preset]?.description || ''}</p>
    ${number('transpose', 'Transpose', part.transpose, 'transpose', { disabled: locked })}
    <div class="music-sound-reset">
      <span>${hasOwnParams(part) ? 'Changed from the preset' : 'As the preset has it'}</span>
      <button
        type="button"
        class="btn btn-ghost"
        data-name="params"
        title="Forget every change to the preset"
        disabled="${locked || !hasOwnParams(part)}"
        onclick="${handleButton}"
      >
        <app-icon name="reset" size="sm"></app-icon> Reset to preset
      </button>
    </div>
    ${paramSectionFields(soundSections(part), ctx)}
  `;
}

/** @param {any} part @param {boolean} locked */
const drums = (part, locked) => html`
  <label class="field-row">
    <span class="field-label">Kit</span>
    ${select('kit', 'Kit', KIT_CHOICES, part.kit, locked)}
  </label>
  <p class="music-sound-about">${KITS[part.kit]?.description || ''}</p>
  <p class="music-sound-about">
    Every drum of a kit is synthesised. Its level and place are part of the kit; the part's own
    volume, pan and sends are in the parts list.
  </p>
`;

/** @type {import('hybrids').Component<MusicSoundHost>} */
export default define({
  tag: 'music-sound',
  shown: { value: /** @type {any} */ ({ kind: '' }) },
  locked: false,
  render: {
    value: ({ shown: part, locked }) => html`
      <div class="field-group-title">Sound</div>
      ${part.kind === 'synth'
        ? synth(part, locked)
        : part.kind === 'drums'
          ? drums(part, locked)
          : html`<p class="music-sound-about">Choose a part to shape its sound.</p>`}
    `,
    shadow: false,
  },
});
