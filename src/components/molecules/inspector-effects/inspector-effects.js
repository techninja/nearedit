/**
 * Inspector group "Effects": the effect stack of the selected clip, or of
 * a track — in the order the effects are applied, each a card that can be
 * switched off, reordered, collapsed and removed. "Add" opens the effect
 * list in place; the stack can be copied and pasted between clips and
 * tracks. Everything leaves as bubbling `effect-action` events (`copy` and
 * `paste` included); parameter edits leave the cards as `field-change`.
 * @module components/molecules/inspector-effects
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';
import '#molecules/effect-card/effect-card.js';
import '#molecules/effect-catalog/effect-catalog.js';

/**
 * @typedef {Object} InspectorEffectsHost
 * @property {any[]} effects - The stack as stored
 * @property {any[]} shown - The same stack at the playhead (keyframes applied)
 * @property {import('#utils/inspector/paramFields.js').ParamContext} context
 * @property {string} owner - What the stack belongs to, for the empty note:
 *   `clip`, `track`, or `clips` when several clips are selected
 * @property {boolean} pasteable - A copied stack is waiting
 * @property {boolean} adding - The effect list is open
 * @property {number} gap - Where a dragged card would drop; -1 when none is dragged
 */

/** @typedef {InspectorEffectsHost & HTMLElement} Host */

/** A toolbar button: `data-action` leaves as an `effect-action`. @param {Host} host @param {Event} event */
function handleAction(host, event) {
  const { action } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'effect-action', { detail: { action }, bubbles: true });
}

/** @param {Host} host */
function handleAdding(host) {
  host.adding = !host.adding;
}

/** An effect was chosen in the list: add it and close the list. @param {Host} host @param {CustomEvent} event */
function handlePick(host, event) {
  event.stopPropagation();
  host.adding = false;
  dispatch(host, 'effect-action', { detail: event.detail, bubbles: true });
}

/** A card is being dragged: show where it would land. @param {Host} host @param {CustomEvent} event */
function handleDrag(host, event) {
  event.stopPropagation();
  host.gap = event.detail.gap;
}

const NOTES = {
  clip: 'No effects on this clip. Add one, or pick it in the Create tab.',
  clips: 'Effects are shown for one clip at a time. Add applies to every selected clip.',
  track: 'No effects on this track. Track effects apply to everything on it together.',
};

/** @type {import('hybrids').Component<InspectorEffectsHost>} */
export default define({
  tag: 'inspector-effects',
  effects: { value: [] },
  shown: { value: [] },
  context: { value: /** @type {any} */ ({ clips: [], time: 0, fps: 30, locked: false }) },
  owner: 'clip',
  pasteable: false,
  adding: false,
  gap: -1,
  render: {
    value: ({ effects, shown, context, owner, pasteable, adding, gap }) => {
      const { locked } = context;
      const marker = (/** @type {number} */ at) =>
        html`<div class="${{ 'inspector-effects-gap': true, active: gap === at }}"></div>`;
      const tool = (
        /** @type {string} */ action,
        /** @type {string} */ icon,
        /** @type {string} */ hint,
        /** @type {boolean} */ enabled,
      ) =>
        html`<button
          type="button"
          class="icon-btn"
          data-action="${action}"
          title="${hint}"
          aria-label="${hint}"
          disabled="${!enabled}"
          onclick="${handleAction}"
        >
          <app-icon name="${icon}" size="sm"></app-icon>
        </button>`;
      return html`
        <div class="field-group-title clip-inspector-group-heading">
          <span>Effects${effects.length ? ` · ${effects.length}` : ''}</span>
          <span class="toolbar-group">
            ${tool(
              'bypass',
              'hidden',
              'Bypass: switch all effects off, or back on',
              effects.length > 0 && !locked,
            )}
            ${tool('copy', 'copy', 'Copy these effects', effects.length > 0)}
            ${tool('paste', 'paste', 'Paste the copied effects here', pasteable && !locked)}
            <button
              type="button"
              class="icon-btn inspector-effects-add"
              aria-expanded="${adding ? 'true' : 'false'}"
              title="Add an effect"
              disabled="${locked}"
              onclick="${handleAdding}"
            >
              <app-icon name="${adding ? 'x' : 'plus'}" size="sm"></app-icon>
              ${adding ? 'Close' : 'Add'}
            </button>
          </span>
        </div>
        ${adding
          ? html`<effect-catalog
              class="inspector-effects-catalog"
              oneffect-pick="${handlePick}"
            ></effect-catalog>`
          : html``}
        <div class="inspector-effects-stack" role="list" oneffect-drag="${handleDrag}">
          ${effects.map((effect, index) =>
            html`${marker(index)}
              <effect-card
                role="listitem"
                effect="${effect}"
                values="${shown.find((fx) => fx.effectId === effect.effectId)?.params ||
                effect.params}"
                context="${context}"
                index="${index}"
                count="${effects.length}"
              ></effect-card>`.key(effect.effectId),
          )}
          ${marker(effects.length)}
        </div>
        ${effects.length && owner !== 'clips'
          ? html``
          : html`<p class="inspector-effects-note">${NOTES[owner] || NOTES.clip}</p>`}
      `;
    },
    shadow: false,
  },
});
