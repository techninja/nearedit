/**
 * Font field — chooses one of the bundled font families, each shown in
 * its own face. The button shows the current family; pressing it opens the
 * list in place (arrow keys move, Escape closes). Reports the choice as a
 * bubbling `field-change` event with `{ name, value, phase: 'commit' }`.
 * @module components/atoms/field-font
 */

import { define, dispatch, html } from 'hybrids';
import { FONT_FAMILIES, resolveFamily } from '#utils/compose/fonts.js';
import { arrowFocus } from '#utils/ui/focus.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} FieldFontHost
 * @property {string} name - Field path reported in the event
 * @property {string} label
 * @property {string} value - Stored family: a bundled id or a generic name
 * @property {boolean} mixed - Several clips disagree
 * @property {boolean} disabled
 * @property {boolean} open - The list is showing
 */

/** @typedef {FieldFontHost & HTMLElement} Host */

/**
 * @param {import('#utils/compose/fonts.js').FontFamily} family
 * @returns {string} CSS `font-family` that shows the family in its own face
 */
const faceOf = (family) =>
  `"${family.id}", ${family.generic === 'monospace' ? 'monospace' : 'sans-serif'}`;

/** @param {Host} host */
function handleOpen(host) {
  host.open = !host.open;
}

/** @param {Host} host @param {Event} event */
function handleChoose(host, event) {
  const { value } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  host.open = false;
  /** @type {HTMLElement|null} */ (host.querySelector('.field-font-current'))?.focus();
  if (value === resolveFamily(host.value).id && !host.mixed) return;
  dispatch(host, 'field-change', {
    detail: { name: host.name, value, phase: 'commit' },
    bubbles: true,
  });
}

/** @param {Host} host @param {KeyboardEvent} event */
function handleListKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    host.open = false;
    /** @type {HTMLElement|null} */ (host.querySelector('.field-font-current'))?.focus();
    return;
  }
  arrowFocus(/** @type {HTMLElement[]} */ ([...host.querySelectorAll('[role="option"]')]), event);
}

/** After the list opened: focus the current family. @param {Host} host @param {boolean} open */
function focusList(host, open) {
  if (!open) return;
  requestAnimationFrame(() => {
    const current = host.querySelector('[role="option"][aria-selected="true"]');
    /** @type {HTMLElement|null} */ (current || host.querySelector('[role="option"]'))?.focus();
  });
}

/** @type {import('hybrids').Component<FieldFontHost>} */
export default define({
  tag: 'field-font',
  name: { value: '', reflect: true },
  label: 'Font',
  value: '',
  mixed: false,
  disabled: false,
  open: { value: false, observe: focusList },
  render: {
    value: ({ label, value, mixed, disabled, open }) => {
      const current = resolveFamily(value);
      return html`
        <span class="field-font-label">${label}</span>
        <span class="field-font-box">
          <button
            type="button"
            class="field-input field-font-current"
            aria-haspopup="listbox"
            aria-expanded="${open ? 'true' : 'false'}"
            aria-label="${`${label}: ${mixed ? 'mixed' : current.label}`}"
            style="${{ fontFamily: mixed ? '' : faceOf(current) }}"
            disabled="${disabled}"
            onclick="${handleOpen}"
          >
            <span>${mixed ? 'Mixed' : current.label}</span>
            <app-icon name="${open ? 'chevron-up' : 'chevron-down'}" size="sm"></app-icon>
          </button>
          ${open
            ? html`<div
                class="field-font-list"
                role="listbox"
                aria-label="${label}"
                onkeydown="${handleListKeys}"
              >
                ${FONT_FAMILIES.map(
                  (family) =>
                    html`<button
                      type="button"
                      role="option"
                      aria-selected="${!mixed && family.id === current.id ? 'true' : 'false'}"
                      data-value="${family.id}"
                      style="${{ fontFamily: faceOf(family) }}"
                      onclick="${handleChoose}"
                    >
                      ${family.label}
                    </button>`,
                )}
              </div>`
            : html``}
        </span>
      `;
    },
    shadow: false,
  },
});
