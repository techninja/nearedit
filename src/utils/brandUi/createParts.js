/**
 * Templates shared by the Brand section of the Create tab and the Brand
 * dialog: a kit's colours as a row of dots, a line saying where the
 * project's kit comes from, and the notice that element clips are out of
 * date with it — with the button that updates them.
 * @module utils/brandUi/createParts
 */

import { html } from 'hybrids';
import { BUILTIN_PREFIX } from '#utils/brand/index.js';
import { elementsWord } from './stale.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** The colour roles a kit is shown by, in the order they are drawn. */
export const SWATCH_ROLES = ['background', 'surface', 'primary', 'accent', 'text'];

/**
 * Colours as a row of dots.
 * @param {string[]} colors - Hex colours
 * @returns {Template}
 */
export function colorDots(colors) {
  return html`<span class="brand-swatches" aria-hidden="true">
    ${colors.map((color) => html`<i style="${{ background: color }}"></i>`)}
  </span>`;
}

/**
 * A kit's colours — background, surface, primary, accent, text — as dots.
 * @param {{ tokens?: { color?: Record<string, string> } }|Record<string, string>|null} kit - A
 *   kit, or its colours by role (a row of the kit list)
 * @returns {Template}
 */
export function kitSwatches(kit) {
  const colors = /** @type {any} */ (kit)?.tokens?.color || kit || {};
  return colorDots(SWATCH_ROLES.map((role) => colors[role]).filter(Boolean));
}

/**
 * @param {import('./kitState.js').KitState} kit
 * @returns {string} Where the project's kit comes from, in a few words
 */
export function kitNote({ choice, status }) {
  if (status === 'loading') return 'Reading the brand…';
  if (status === 'fallback') return 'Built-in kit';
  if (choice === 'project') return 'This project’s own';
  return choice.startsWith(BUILTIN_PREFIX) ? 'Built-in kit' : 'From your library';
}

/**
 * The notice that element clips are out of date with the kit.
 * @param {import('./stale.js').StaleInfo} stale
 * @param {(host: any, event: Event) => void} onUpdate - Handler of the update button
 * @param {string} [said] - What the last update did, shown when nothing is stale
 * @returns {Template}
 */
export function staleNotice(stale, onUpdate, said = '') {
  const count = stale.outdated.length;
  const more = [
    stale.locked.length && `${elementsWord(stale.locked.length)} on locked tracks stay as they are`,
    stale.missing.length &&
      `${elementsWord(stale.missing.length)} this brand does not have stay as they are`,
  ].filter(Boolean);
  if (!count && !more.length) {
    return said ? html`<p class="brand-stale brand-stale-done" role="status">${said}</p>` : html``;
  }
  return html`<div class="brand-stale" role="status">
    ${count
      ? html`<p>
            <strong>${elementsWord(count)}</strong> on the timeline ${count === 1 ? 'is' : 'are'}
            out of date with the brand.
          </p>
          <button type="button" class="btn btn-primary brand-stale-update" onclick="${onUpdate}">
            Update ${elementsWord(count)} to brand
          </button>`
      : html``}
    ${more.map((line) => html`<p class="brand-stale-more">${line}.</p>`)}
  </div>`;
}
