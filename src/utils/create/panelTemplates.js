/**
 * Templates of the Create tab's sections: a tile (thumbnail and name), the
 * generator tiles by category with their search box, the text styles (and,
 * with them, the entry for captions), and the effect list with a line
 * saying what an effect would be applied to.
 * @module utils/create/panelTemplates
 */

import { html } from 'hybrids';
import { groupByCategory, searchItems } from './catalogView.js';
import { endDrag } from './dragTypes.js';
import { effectTargets } from './panelActions.js';
import * as on from './panelEvents.js';
import { TEXT_PRESETS } from './textPresets.js';

/** @typedef {import('./panelEvents.js').CreatePanelHost} CreatePanelHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<CreatePanelHost>} Template */

/**
 * One tile: a thumbnail and a name.
 * @param {'generator'|'text'} kind
 * @param {{ key: string, label: string, description: string, preset?: string }} item
 * @param {string} hovered
 * @returns {Template}
 */
export function tile(kind, item, hovered) {
  return html`<button
    type="button"
    class="create-panel-tile"
    data-kind="${kind}"
    data-key="${item.key}"
    title="${`Add ${item.label}: ${item.description}`}"
    draggable="true"
    onclick="${on.handleAdd}"
    onpointerenter="${on.handleHover}"
    onpointerleave="${on.handleLeave}"
    onfocus="${on.handleHover}"
    onblur="${on.handleLeave}"
    ondragstart="${on.handleDragStart}"
    ondragend="${endDrag}"
  >
    <create-thumb
      spec="${on.thumbOf(kind, item.key)}"
      playing="${hovered === item.key}"
    ></create-thumb>
    <span class="create-panel-name">${item.label}</span>
  </button>`.key(`${kind}:${item.key}`);
}

/** @param {CreatePanelHost} host @returns {Template} */
export function generatorTiles({ query, hovered }) {
  const groups = groupByCategory(searchItems(on.allGenerators(), query));
  return html`
    <div class="create-panel-search">
      <app-icon name="search" size="sm"></app-icon>
      <input
        class="field-input"
        type="search"
        placeholder="Search generators"
        aria-label="Search generators"
        value="${query}"
        oninput="${on.handleSearch}"
        onkeydown="${on.handleSearchKeys}"
      />
    </div>
    ${groups.map(
      (group) => html`
        <div class="field-group-title">${group.label}</div>
        <div class="create-panel-grid" role="group" aria-label="${group.label}">
          ${group.items.map((item) => tile('generator', item, hovered))}
        </div>
      `,
    )}
    ${groups.length
      ? html``
      : html`<div class="empty-state">No generator matches “${query}”.</div>`}
  `;
}

/** @param {CreatePanelHost} host @returns {Template} */
export function textTiles({ hovered }) {
  return html`<div class="field-group-title">Text styles</div>
    <div class="create-panel-grid" role="group" aria-label="Text styles">
      ${TEXT_PRESETS.map((preset) => tile('text', { ...preset, key: preset.id }, hovered))}
    </div>
    <captions-create oncaptions-status="${on.handleCaptionsStatus}"></captions-create>`;
}

/** @param {CreatePanelHost} host @returns {Template} */
export function effectList({ selection }) {
  const targets = effectTargets(selection);
  const hint = !targets.length
    ? 'Select a clip in the timeline or the preview, then pick an effect — or drag one onto a clip.'
    : targets.length === 1
      ? `Adds to “${targets[0].label}”.`
      : `Adds to the ${targets.length} selected clips.`;
  return html`<effect-catalog
    hint="${hint}"
    drag-items="${true}"
    oneffect-pick="${on.handleEffectPick}"
  ></effect-catalog>`;
}
