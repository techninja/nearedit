/**
 * Keyframe button — sits beside an inspector field that can be animated.
 * The diamond shows three states: hollow (not animated), filled (a key
 * under the playhead) and outlined in the accent colour (animated, between
 * keys); pressing it adds or removes the key under the playhead, which also
 * starts the animation. While animated, arrows step to the previous and
 * next key and a menu sets the easing of the current key or stops the
 * animation. Reports every press as a bubbling `keyframe-action` event
 * with `{ paths, action, ease? }`.
 * @module components/atoms/keyframe-control
 */

import { define, html } from 'hybrids';
import { EASINGS } from '#utils/edl/easing.js';
import * as on from '#utils/keyframes/controlEvents.js';
import { humanize } from '#utils/keyframes/labels.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/keyframes/controlEvents.js').KeyframeControlHost} KeyframeControlHost */

const KEY_HINTS = {
  none: 'Animate: add a keyframe here',
  key: 'Remove the keyframe here',
  between: 'Add a keyframe here',
};

/**
 * @param {KeyframeControlHost} host
 * @returns {import('hybrids').UpdateFunctionWithMethods<KeyframeControlHost>}
 */
function menu({ previous, next, ease, current, place }) {
  const item = (
    /** @type {string} */ action,
    /** @type {string} */ text,
    /** @type {boolean} */ enabled,
  ) =>
    html`<button
      type="button"
      class="menu-item"
      role="menuitem"
      data-action="${action}"
      disabled="${!enabled}"
      onclick="${on.handleItem}"
    >
      ${text}
    </button>`;
  return html`
    <div class="keyframe-control-backdrop" onclick="${on.closeMenu}"></div>
    <div
      class="menu keyframe-control-menu"
      role="menu"
      aria-label="Keyframes"
      style="${{
        left: `${place.left}px`,
        top: `${place.top}px`,
        maxHeight: `${place.maxHeight}px`,
      }}"
      onkeydown="${on.handleMenuKeys}"
    >
      ${item('previous', 'Previous keyframe', previous)} ${item('next', 'Next keyframe', next)}
      <div class="menu-sep"></div>
      <div class="keyframe-control-heading">
        ${current ? 'Easing after this key' : 'Easing (no key before the playhead)'}
      </div>
      ${EASINGS.map(
        (name) =>
          html`<button
            type="button"
            class="menu-item"
            role="menuitemradio"
            aria-checked="${name === ease ? 'true' : 'false'}"
            data-action="ease"
            data-ease="${name}"
            disabled="${!current}"
            onclick="${on.handleItem}"
          >
            ${humanize(name)}
          </button>`,
      )}
      <div class="menu-sep"></div>
      ${item('stop', 'Stop animating (keep this value)', true)}
    </div>
  `;
}

/** @type {import('hybrids').Component<KeyframeControlHost>} */
export default define({
  tag: 'keyframe-control',
  paths: { value: [] },
  label: '',
  state: { value: 'none', reflect: true },
  previous: false,
  next: false,
  ease: '',
  current: false,
  disabled: false,
  open: { value: false, observe: on.focusMenu },
  place: { value: { left: 0, top: 0, maxHeight: 320 } },
  render: {
    value: (host) => {
      const { label, state, previous, next, disabled, open } = host;
      const animated = state !== 'none';
      const step = (/** @type {string} */ way, /** @type {boolean} */ enabled) =>
        html`<button
          type="button"
          class="icon-btn keyframe-control-step"
          data-step="${way}"
          title="${way === 'next' ? 'Next keyframe' : 'Previous keyframe'}"
          aria-label="${`${label}: ${way} keyframe`}"
          disabled="${disabled || !enabled}"
          onclick="${on.handleStep}"
        >
          <app-icon name="${way === 'next' ? 'chevron' : 'chevron-left'}" size="sm"></app-icon>
        </button>`;
      return html`
        ${animated ? step('previous', previous) : html``}
        <button
          type="button"
          class="icon-btn keyframe-control-key"
          title="${KEY_HINTS[state]}"
          aria-label="${`${label}: ${KEY_HINTS[state].toLowerCase()}`}"
          aria-pressed="${state === 'key' ? 'true' : 'false'}"
          disabled="${disabled}"
          onclick="${on.handleToggle}"
        >
          <app-icon name="keyframe" size="sm"></app-icon>
        </button>
        ${animated ? step('next', next) : html``}
        ${animated
          ? html`<button
              type="button"
              class="icon-btn keyframe-control-more"
              title="Easing and more"
              aria-label="${`${label}: keyframe menu`}"
              aria-haspopup="menu"
              aria-expanded="${open ? 'true' : 'false'}"
              disabled="${disabled}"
              onclick="${on.handleMore}"
            >
              <app-icon name="chevron-down" size="sm"></app-icon>
            </button>`
          : html``}
        ${open ? menu(host) : html``}
      `;
    },
    shadow: false,
  },
});
