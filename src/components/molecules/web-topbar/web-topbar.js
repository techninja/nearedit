/**
 * Top bar of the web editor — what the whole recording is of: the address,
 * the page size, the colour scheme the page is asked for, how the drawn
 * cursor looks, and "Refresh view". Changes leave as bubbling
 * `field-change` events (`url`, `size`, `colorScheme`, `cursor.style`,
 * `cursor.size`); the refresh button sends `web-refresh`.
 * @module components/molecules/web-topbar
 */

import { define, html } from 'hybrids';
import { COLOR_SCHEMES, CURSOR_STYLES, RECIPE_LIMITS } from '#utils/web/index.js';
import { sizeChoices, sizeIdOf } from '#utils/webUi/sizes.js';
import * as on from '#utils/webUi/topbarEvents.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} WebTopbarHost
 * @property {import('#utils/web/types.js').Recipe} recipe
 * @property {boolean} busy - The page view is being refreshed
 * @property {boolean} locked - The clip is on a locked track
 * @property {string} problem - Why the address that was typed cannot be used
 */

const CURSOR_NAMES = { arrow: 'Arrow', dot: 'Dot', none: 'No cursor' };
const SCHEME_NAMES = { light: 'Light page', dark: 'Dark page' };

/**
 * @param {string} name
 * @param {string} label
 * @param {[string, string][]} options
 * @param {string} value
 * @param {boolean} locked
 */
function choice(name, label, options, value, locked) {
  return html`<select
    class="field-input"
    data-name="${name}"
    aria-label="${label}"
    title="${label}"
    disabled="${locked}"
    onchange="${on.handleChoice}"
  >
    ${options.map(
      ([id, text]) => html`<option value="${id}" selected="${id === value}">${text}</option>`,
    )}
  </select>`;
}

/** @type {import('hybrids').Component<WebTopbarHost>} */
export default define({
  tag: 'web-topbar',
  recipe: { value: /** @type {any} */ ({}) },
  busy: false,
  locked: false,
  problem: '',
  render: {
    value: ({ recipe, busy, locked, problem }) => {
      if (!recipe.cursor) return html``;
      const [minSize, maxSize] = RECIPE_LIMITS.cursorSize;
      return html`
        <label class="web-topbar-address">
          <app-icon name="web" size="sm"></app-icon>
          <input
            class="field-input"
            type="text"
            inputmode="url"
            spellcheck="false"
            autocomplete="off"
            aria-label="Address of the page"
            aria-invalid="${problem ? 'true' : 'false'}"
            value="${recipe.url}"
            disabled="${locked}"
            onchange="${on.handleAddress}"
            onkeydown="${on.handleAddressKeys}"
          />
        </label>
        ${choice('size', 'Page size', sizeChoices(recipe), sizeIdOf(recipe), locked)}
        ${choice(
          'colorScheme',
          'Colour scheme the page is shown in',
          COLOR_SCHEMES.map((id) => [id, SCHEME_NAMES[id]]),
          recipe.colorScheme,
          locked,
        )}
        ${choice(
          'cursor.style',
          'Cursor',
          CURSOR_STYLES.map((id) => [id, CURSOR_NAMES[id] || id]),
          recipe.cursor.style,
          locked,
        )}
        <label class="web-topbar-size" title="Size of the drawn cursor">
          <span class="field-label">Cursor ×</span>
          <input
            class="field-input field-num"
            type="number"
            data-name="cursor.size"
            data-type="number"
            aria-label="Cursor size"
            min="${minSize}"
            max="${maxSize}"
            step="0.25"
            value="${recipe.cursor.size}"
            disabled="${locked || recipe.cursor.style === 'none'}"
            onchange="${on.handleChoice}"
          />
        </label>
        <button
          type="button"
          class="icon-btn web-topbar-refresh"
          title="Load the page again and show it as it is now"
          disabled="${busy}"
          onclick="${on.handleRefresh}"
        >
          <app-icon name="refresh" size="sm"></app-icon> Refresh view
        </button>
        ${problem && html`<p class="error-message web-topbar-problem" role="alert">${problem}</p>`}
      `;
    },
    shadow: false,
  },
});
