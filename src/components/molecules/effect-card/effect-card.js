/**
 * One effect of a stack: a header — reorder grip, on/off, name (press to
 * collapse), reset, remove — and the effect's parameters as controls built
 * from its catalog schema. Stack changes leave as bubbling `effect-action`
 * events, parameter changes as `field-change` events named
 * `effects.<effectId>.<param>`.
 * @module components/molecules/effect-card
 */

import { define, html } from 'hybrids';
import { effectModule } from '#utils/compose/catalog.js';
import * as on from '#utils/inspector/effectCardEvents.js';
import { paramControls } from '#utils/inspector/paramControls.js';
import { paramSectionFields } from '#utils/inspector/sectionFields.js';
import { paramSections } from '#utils/inspector/paramSections.js';
import { humanize } from '#utils/keyframes/labels.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-image/field-image.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/** @typedef {import('#utils/inspector/effectCardEvents.js').EffectCardHost} EffectCardHost */

/**
 * A header button.
 * @param {string} action
 * @param {string} icon
 * @param {string} hint
 * @param {boolean} disabled
 * @param {boolean|null} [pressed]
 * @returns {import('hybrids').UpdateFunctionWithMethods<EffectCardHost>}
 */
function button(action, icon, hint, disabled, pressed = null) {
  return html`<button
    type="button"
    class="icon-btn"
    data-action="${action}"
    title="${hint}"
    aria-label="${hint}"
    aria-pressed="${pressed === null ? false : pressed ? 'true' : 'false'}"
    disabled="${disabled}"
    onclick="${on.handleButton}"
  >
    <app-icon name="${icon}" size="sm"></app-icon>
  </button>`;
}

/** @type {import('hybrids').Component<EffectCardHost>} */
export default define({
  tag: 'effect-card',
  effect: { value: /** @type {any} */ ({}) },
  values: { value: {} },
  context: { value: /** @type {any} */ ({ clips: [], time: 0, fps: 30, locked: false }) },
  index: 0,
  count: 1,
  collapsed: false,
  render: {
    value: ({ effect, values, context, count, collapsed }) => {
      const module = effectModule(effect.type);
      const name = module?.label || humanize(effect.type || 'Effect');
      const prefix = `effects.${effect.effectId}`;
      const controls = module ? paramControls(module.params, values, prefix) : [];
      const { locked } = context;
      return html`
        <div class="effect-card" data-enabled="${effect.enabled ? 'true' : 'false'}">
          <header class="effect-card-header">
            <button
              type="button"
              class="icon-btn effect-card-grip"
              title="Drag to reorder (or use the arrow keys)"
              aria-label="${`Reorder ${name}: drag, or use the arrow keys`}"
              disabled="${locked || count < 2}"
              onpointerdown="${on.handleGripDown}"
              onpointermove="${on.handleGripMove}"
              onpointerup="${on.handleGripUp}"
              onpointercancel="${on.handleGripUp}"
              onkeydown="${on.handleGripKeys}"
            >
              <app-icon name="grip" size="sm"></app-icon>
            </button>
            ${button(
              'toggle',
              'power',
              effect.enabled ? `Switch ${name} off` : `Switch ${name} on`,
              locked,
              Boolean(effect.enabled),
            )}
            <button
              type="button"
              class="effect-card-title"
              aria-expanded="${collapsed ? 'false' : 'true'}"
              title="${module?.description || name}"
              onclick="${on.handleCollapse}"
            >
              <span>${name}</span>
              <app-icon name="${collapsed ? 'chevron' : 'chevron-down'}" size="sm"></app-icon>
            </button>
            ${button('reset', 'reset', `Reset ${name} to its defaults`, locked)}
            ${button('remove', 'trash', `Remove ${name}`, locked)}
          </header>
          ${collapsed
            ? html``
            : html`<div class="effect-card-body">
                ${module
                  ? html``
                  : html`<p class="effect-card-note">
                      “${effect.type}” is not an effect this version knows; it draws nothing.
                    </p>`}
                ${paramSectionFields(
                  paramSections(controls, effect.params || {}, module?.params),
                  context,
                )}
                ${module && !controls.length
                  ? html`<p class="effect-card-note">This effect has no settings.</p>`
                  : html``}
              </div>`}
        </div>
      `;
    },
    shadow: false,
  },
});
