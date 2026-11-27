/**
 * Colour field — a colour well, the hex value as text (`#rrggbb`, or
 * `#rrggbbaa` with transparency) and, for optional colours, a "none" button. Reports changes as bubbling `field-change`
 * events with `{ name, value, phase }`: `live` while the picker is being
 * dragged, `commit` for the final choice. An empty value means "none".
 * @module components/atoms/field-color
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} FieldColorHost
 * @property {string} name - Field path reported in the event
 * @property {string} label
 * @property {string} value - `#rrggbb`, or '' for none
 * @property {boolean} mixed
 * @property {boolean} optional - '' is allowed: show the clear button
 * @property {boolean} disabled
 * @property {string} fallback - Colour shown in the well while the value is ''
 */

/** @typedef {FieldColorHost & HTMLElement} Host */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * @param {string} text
 * @returns {string|null} `#rrggbb` (or `#rrggbbaa` for a colour with
 *   transparency) in lower case, null when it is not a hex colour
 */
export function normalizeHex(text) {
  const match = HEX.exec(String(text ?? '').trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits}`;
}

/**
 * The part of a colour a colour well can show.
 * @param {string} value
 * @returns {string|null} `#rrggbb`, without any transparency
 */
const opaque = (value) => normalizeHex(value)?.slice(0, 7) || null;

/**
 * @param {Host} host
 * @param {string} value
 * @param {'live'|'commit'} phase
 */
function emit(host, value, phase) {
  dispatch(host, 'field-change', { detail: { name: host.name, value, phase }, bubbles: true });
}

/** @param {Host} host @param {Event} event */
function handleWell(host, event) {
  event.stopPropagation();
  const picked = /** @type {HTMLInputElement} */ (event.target).value;
  // The well knows no transparency: what the colour had, it keeps.
  const alpha = (normalizeHex(host.value) || '').slice(7);
  emit(host, picked + alpha, event.type === 'input' ? 'live' : 'commit');
}

/** @param {Host} host @param {Event} event */
function handleText(host, event) {
  event.stopPropagation();
  const input = /** @type {HTMLInputElement} */ (event.target);
  const text = input.value.trim();
  const value = text === '' && host.optional ? '' : normalizeHex(text);
  if (value === null) input.value = host.mixed ? '' : host.value;
  else if (value !== host.value || host.mixed) emit(host, value, 'commit');
}

/** @param {Host} host */
function handleClear(host) {
  emit(host, '', 'commit');
}

/** @type {import('hybrids').Component<FieldColorHost>} */
export default define({
  tag: 'field-color',
  name: { value: '', reflect: true },
  label: '',
  value: '',
  mixed: false,
  optional: false,
  disabled: false,
  fallback: '#000000',
  render: {
    value: ({ label, value, mixed, optional, disabled, fallback }) => html`
      <span class="field-color-label">${label}</span>
      <span class="field-color-box">
        <input
          class="${{ 'field-color-well': true, 'field-color-none': !value && !mixed }}"
          type="color"
          aria-label="${label}"
          value="${opaque(value) || fallback}"
          disabled="${disabled}"
          oninput="${handleWell}"
          onchange="${handleWell}"
        />
        <input
          class="field-input field-color-hex"
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label="${label} hex value"
          placeholder="${mixed ? '—' : optional ? 'none' : ''}"
          value="${mixed ? '' : value}"
          disabled="${disabled}"
          onchange="${handleText}"
        />
        ${optional &&
        html`<button
          type="button"
          class="icon-btn"
          title="No colour"
          aria-label="${label}: none"
          disabled="${disabled || (!value && !mixed)}"
          onclick="${handleClear}"
        >
          <app-icon name="x" size="sm"></app-icon>
        </button>`}
      </span>
    `,
    shadow: false,
  },
});
