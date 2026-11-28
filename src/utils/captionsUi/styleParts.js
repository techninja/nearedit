/**
 * Templates of the caption style editor: the presets as tiles, and the
 * style's controls in sections that open and close. The controls are the
 * inspector's own (`paramFields`), built from `CAPTION_STYLE`; only the
 * font is a dropdown of its own, because it also offers the document's
 * fonts.
 * @module utils/captionsUi/styleParts
 */

import { html } from 'hybrids';
import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { PRESET_NAMES } from '#utils/captions/style.js';
import { paramFields } from '#utils/inspector/paramFields.js';
import { fontChoices, presetOf } from './styleControls.js';
import { handleFont, handleTile, handleTileKeys } from './styleEvents.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** No keyframes, nothing locked: the style belongs to the document. */
const CONTEXT = { clips: [], time: 0, fps: 30, locked: false };

/**
 * The picture on a tile, as a template of its own: hybrids takes a tag
 * that starts with `caption` for table markup, and treats whatever follows
 * it in the same template accordingly. Nothing follows it here.
 * @param {string} preset
 * @param {object} look - A style to show instead of the preset; {} for none
 * @param {any[]} fonts
 * @param {boolean} playing
 * @returns {Template}
 */
export const tilePicture = (preset, look, fonts, playing) =>
  html`<caption-tile
    preset="${preset}"
    look="${look}"
    fonts="${fonts}"
    playing="${playing}"
  ></caption-tile>`;

/**
 * The presets, each a tile that shows it. The tile of the preset in use
 * shows the style as it is now, changes included.
 * @param {unknown} stored - What the document holds (`edl.captions?.style`)
 * @param {any[]} fonts - The document's own fonts
 * @param {boolean} playing - Tiles move
 * @returns {Template}
 */
export function presetTiles(stored, fonts, playing) {
  const current = presetOf(stored).name;
  const own = stored !== null && typeof stored === 'object' ? stored : {};
  return html`<div
    class="captions-style-tiles"
    role="group"
    aria-label="Caption presets"
    onkeydown="${handleTileKeys}"
  >
    ${PRESET_NAMES.map((name) => {
      const { label, description } = CAPTION_PRESETS[name];
      return html`<button
        type="button"
        class="captions-style-tile"
        data-preset="${name}"
        aria-pressed="${name === current ? 'true' : 'false'}"
        title="${`${label}: ${description}`}"
        onclick="${handleTile}"
      >
        ${tilePicture(name, name === current ? own : {}, fonts, playing)}
        <span class="captions-style-name">${label}</span>
      </button>`.key(name);
    })}
  </div>`;
}

/**
 * The font dropdown.
 * @param {import('#utils/inspector/paramControls.js').ParamControl} control
 * @param {any[]} fonts
 * @returns {Template}
 */
function fontRow(control, fonts) {
  const current = String(control.value || '');
  return html`<div class="keyed-row">
    <label class="field-row">
      <span class="field-label" title="${control.label}">${control.label}</span>
      <select
        class="field-input"
        data-name="${control.path}"
        aria-label="${control.label}"
        style="${{ fontFamily: `"${current}", sans-serif` }}"
        onchange="${handleFont}"
      >
        ${fontChoices(fonts, current).map(
          (group) =>
            html`<optgroup label="${group.label}">
              ${group.families.map(
                (family) =>
                  html`<option
                    value="${family}"
                    selected="${family.toLowerCase() === current.toLowerCase()}"
                  >
                    ${family}
                  </option>`,
              )}
            </optgroup>`,
        )}
      </select> </label
    ><span></span>
  </div>`.key(control.path);
}

/**
 * The style's controls, section by section.
 * @param {import('./styleControls.js').StyleSection[]} sections
 * @param {any[]} fonts
 * @returns {Template[]}
 */
export function sectionFields(sections, fonts) {
  return sections.map((section, index) => {
    const rows = section.controls.map((control) =>
      control.name === 'font.family' ? fontRow(control, fonts) : paramFields([control], CONTEXT)[0],
    );
    return html`<details class="inspector-section captions-style-section" open="${index === 0}">
      <summary class="field-group-title">
        <span>${section.title}</span>
        ${section.changed
          ? html`<span class="chip" title="Fields that differ from the preset"
              >${section.changed} changed</span
            >`
          : html``}
      </summary>
      ${rows}
    </details>`.key(section.title);
  });
}
