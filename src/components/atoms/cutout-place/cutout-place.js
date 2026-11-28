/**
 * Placement button atom — one of the usual places for a cut-out person,
 * shown as a small picture of the frame with the person in it: filling it,
 * full height at a side, in a lower corner, in a round window. A plain
 * button inside: listen for `click` on the element.
 * @module components/atoms/cutout-place
 */

import { define, html } from 'hybrids';

/**
 * @typedef {Object} CutoutPlaceHost
 * @property {string} place - Placement id: `fill`, `left`, `right`,
 *   `corner-left`, `corner-right`, `circle-left`, `circle-right`
 * @property {string} label - What it is called
 * @property {string} hint - What it does, for the tooltip
 * @property {boolean} pressed - The selection is in this placement
 * @property {boolean} disabled
 */

/** @type {import('hybrids').Component<CutoutPlaceHost>} */
export default define({
  tag: 'cutout-place',
  place: 'fill',
  label: '',
  hint: '',
  pressed: false,
  disabled: false,
  render: {
    value: ({ place, label, hint, pressed, disabled }) => html`
      <button
        type="button"
        data-place="${place}"
        title="${hint ? `${label} — ${hint}` : label}"
        aria-label="${label}"
        aria-pressed="${String(pressed)}"
        disabled="${disabled}"
      >
        <i></i>
      </button>
    `,
    shadow: false,
  },
});
