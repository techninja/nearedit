/**
 * Inspector group "Animation" of a title: how the text arrives and how it
 * leaves — the kind of move, how long each piece takes, whether it moves
 * as a block or line by line, word by word or letter by letter, the delay
 * between pieces and the easing — with a button that plays just that
 * entrance or exit in the preview. Changes leave as bubbling
 * `field-change` events named `text.animateIn.*` / `text.animateOut.*`.
 * @module components/molecules/inspector-text-motion
 */

import { define, html } from 'hybrids';
import { TEXT_ANIMATIONS, TEXT_UNITS } from '#utils/edl/defaults.js';
import { EASINGS } from '#utils/edl/easing.js';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { fieldOf, numberField, selectField } from '#utils/inspector/fieldTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import { previewAnimation } from '#utils/inspector/previewAnimation.js';
import { targetsOf } from '#utils/inspector/targets.js';
import { humanize } from '#utils/keyframes/labels.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} InspectorTextMotionHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** @type {(names: string[]) => [string, string][]} */
const options = (names) => names.map((name) => [name, humanize(name)]);
const UNIT_NAMES = { block: 'Block', line: 'Line', word: 'Word', char: 'Letter' };

/** Play the entrance or exit of the selected title. @param {InspectorTextMotionHost & HTMLElement} host @param {Event} event */
function handlePreview(host, event) {
  const { edge } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const [ref] = targetsOf(host.model.refs, 'text.content');
  if (ref) previewAnimation(ref.clip.clipId, edge === 'out' ? 'out' : 'in');
}

/**
 * The controls of one edge.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @param {'in'|'out'} edge
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTextMotionHost>}
 */
function edgeFields(model, edge) {
  const base = `text.animate${edge === 'in' ? 'In' : 'Out'}`;
  const type = fieldOf(model, `${base}.type`);
  const by = fieldOf(model, `${base}.by`);
  const active = type.mixed || (type.value && type.value !== 'none');
  const title = edge === 'in' ? 'Animate in' : 'Animate out';
  return html`
    <div class="keyed-row">
      ${selectField(model, `${base}.type`, title, options(TEXT_ANIMATIONS))}
      <button
        type="button"
        class="icon-btn inspector-text-motion-play"
        data-edge="${edge}"
        title="${edge === 'in' ? 'Play the entrance' : 'Play the exit'}"
        aria-label="${edge === 'in' ? 'Preview the entrance' : 'Preview the exit'}"
        disabled="${!active}"
        onclick="${handlePreview}"
      >
        <app-icon name="play" size="sm"></app-icon> Play
      </button>
    </div>
    ${active
      ? html`
          ${keyed(
            model,
            [],
            'Piece by piece',
            html`<div class="field-row">
              <span class="field-label">Piece by piece</span>
              <span class="seg" role="group" aria-label="${`${title}: what moves`}">
                ${TEXT_UNITS.map(
                  (unit) =>
                    html`<button
                      type="button"
                      data-name="${`${base}.by`}"
                      data-value="${unit}"
                      aria-pressed="${!by.mixed && by.value === unit ? 'true' : 'false'}"
                      disabled="${model.locked}"
                      onclick="${handleButton}"
                    >
                      ${UNIT_NAMES[unit] || humanize(unit)}
                    </button>`,
                )}
              </span>
            </div>`,
          )}
          ${keyed(
            model,
            [],
            'Time / delay',
            html`<div class="field-row">
              <span class="field-label">Time / delay</span>
              <span class="field-pair">
                ${numberField(model, `${base}.duration`, '', { compact: true })}
                ${numberField(model, `${base}.stagger`, '', {
                  compact: true,
                  disabled: !by.mixed && by.value === 'block',
                })}
              </span>
            </div>`,
          )}
          ${keyed(
            model,
            [],
            'Easing',
            selectField(model, `${base}.ease`, 'Easing', options(EASINGS)),
          )}
        `
      : html``}
  `;
}

/** @type {import('hybrids').Component<InspectorTextMotionHost>} */
export default define({
  tag: 'inspector-text-motion',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.show?.text) return html``;
      return html`
        <details class="inspector-section" open>
          <summary class="field-group-title"><span>Animation</span></summary>
          ${edgeFields(model, 'in')} ${edgeFields(model, 'out')}
        </details>
      `;
    },
    shadow: false,
  },
});
