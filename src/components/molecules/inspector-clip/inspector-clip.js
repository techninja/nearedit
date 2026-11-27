/**
 * Inspector group "Clip": label, colour, link and group actions and — for
 * placeholders — what is meant to go there (intent, prompt). Changes leave
 * as bubbling `field-change` events.
 * @module components/molecules/inspector-clip
 */

import { define, html } from 'hybrids';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { colorField, selectField, textField } from '#utils/inspector/fieldTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';

/**
 * @typedef {Object} InspectorClipHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** @type {[string, string][]} */
const INTENTS = [
  ['', 'Not set'],
  ['narration', 'Narration'],
  ['broll', 'B-roll'],
  ['music', 'Music'],
  ['sfx', 'Sound effect'],
  ['title', 'Title'],
  ['transition', 'Transition'],
];

/**
 * One link/group action button.
 * @param {string} action - `action.*` name
 * @param {string} icon
 * @param {string} label
 * @param {string} hint
 * @param {boolean} enabled
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorClipHost>}
 */
function actionButton(action, icon, label, hint, enabled) {
  return html`<button
    type="button"
    class="icon-btn"
    data-name="${action}"
    title="${hint}"
    disabled="${!enabled}"
    onclick="${handleButton}"
  >
    <app-icon name="${icon}" size="sm"></app-icon> ${label}
  </button>`;
}

/**
 * @param {import('#utils/inspector/model.js').InspectorModel['link']} link
 * @param {number} count
 * @returns {string} The link and group situation in words
 */
function linkSummary(link, count) {
  const parts = [];
  if (link.linked && !link.partner)
    parts.push(count === 2 ? 'Picture and sound are linked' : `${link.linked} linked`);
  if (link.partner) parts.push('Linked to a clip that is not selected');
  if (link.grouped) parts.push(`${link.grouped} grouped`);
  return parts.join(' · ') || 'Not linked or grouped';
}

/** @type {import('hybrids').Component<InspectorClipHost>} */
export default define({
  tag: 'inspector-clip',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.count) return html``;
      const { link, locked } = model;
      return html`
        <div class="field-group-title">Clip</div>
        ${textField(model, 'label', 'Label', { placeholder: 'Name shown on the clip' })}
        ${colorField(model, 'color', 'Colour', { optional: true, fallback: '#3b82f6' })}
        ${model.show.placeholder &&
        html`${selectField(model, 'intent', 'Intent', INTENTS)}
        ${textField(model, 'prompt', 'Prompt', { rows: 3, placeholder: 'What should go here?' })}`}
        <div class="field-row inspector-clip-links">
          <span class="field-label" title="${linkSummary(link, model.count)}"
            >${linkSummary(link, model.count)}</span
          >
          <span class="toolbar-group">
            ${link.canUnlink
              ? actionButton(
                  'action.unlink',
                  'unlink',
                  'Unlink',
                  'Let picture and sound be edited separately',
                  !locked,
                )
              : actionButton(
                  'action.link',
                  'link',
                  'Link',
                  'Link the two selected clips so they move and trim together',
                  link.canLink && !locked,
                )}
            ${link.canUngroup && !link.canGroup
              ? actionButton('action.ungroup', 'ungroup', 'Ungroup', 'Dissolve the group', !locked)
              : actionButton(
                  'action.group',
                  'group',
                  'Group',
                  'Group the selected clips so they move together',
                  link.canGroup && !locked,
                )}
          </span>
        </div>
      `;
    },
    shadow: false,
  },
});
