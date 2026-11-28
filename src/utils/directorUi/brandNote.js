/**
 * The line in the director's form that says an action follows the brand:
 * the project's kit by name, with its colours, and what the action takes
 * from it. Shown for the actions whose schema carries `brand`.
 * @module utils/directorUi/brandNote
 */

import { html } from 'hybrids';

/** The colours of a kit a swatch shows, in the order they are read. */
const SHOWN = ['background', 'surface', 'primary', 'accent', 'text'];

/**
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @param {import('#utils/brandUi/kitState.js').KitState|null|undefined} kit - The
 *   project's kit as the editing session knows it
 * @returns {any} Nothing for an action that does not follow the brand
 */
export function brandNote(action, kit) {
  if (!action.brand) return html``;
  const effective = kit?.effective;
  const name = effective?.name || effective?.id || '';
  const colors = SHOWN.map((role) => effective?.tokens?.color?.[role]).filter(Boolean);
  return html`<p class="director-panel-brand" role="note">
    <span class="director-panel-swatch" aria-hidden="true">
      ${colors.map((color) => html`<i style="${{ backgroundColor: color }}"></i>`)}
    </span>
    <span>
      ${name ? html`<strong>On brand · ${name}.</strong> ` : html`<strong>On brand.</strong> `}
      ${action.brand}
    </span>
  </p>`;
}
