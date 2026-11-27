/**
 * Value box — a number (or timecode) that is pleasant to change: type a
 * value (sums like `100+20` work), step with the arrow keys (Shift for
 * bigger steps, Alt for finer), or drag the label sideways to scrub.
 * Reports every change as a bubbling `field-change` event with
 * `{ name, value, phase }`: `live` while stepping or scrubbing, `commit`
 * for the final value, `cancel` when Escape abandons the interaction.
 * @module components/atoms/field-number
 */

import { define, html } from 'hybrids';
import { formatValue } from '#utils/inspector/fieldValue.js';
import {
  handleBlur,
  handleInput,
  handleKeydown,
  handleKeyup,
  handleScrubEnd,
  handleScrubMove,
  handleScrubStart,
  handleSlide,
} from '#utils/inspector/valueBox.js';

/** @type {import('hybrids').Component<import('#utils/inspector/valueBox.js').ValueBoxHost>} */
export default define({
  tag: 'field-number',
  name: { value: '', reflect: true },
  label: '',
  caption: '',
  value: 0,
  mixed: false,
  disabled: false,
  slider: false,
  spec: { value: {} },
  draft: '',
  typing: false,
  render: {
    value: ({ label, caption, value, mixed, disabled, slider, spec, draft, typing }) => html`
      <span
        class="field-number-label"
        title="${disabled ? '' : 'Drag to change'}"
        onpointerdown="${handleScrubStart}"
        onpointermove="${handleScrubMove}"
        onpointerup="${handleScrubEnd}"
        onpointercancel="${handleScrubEnd}"
        >${label}</span
      >
      <span class="field-number-box">
        ${slider &&
        html`<input
          class="field-range"
          type="range"
          aria-label="${caption || label} slider"
          min="${spec.min ?? 0}"
          max="${spec.max ?? 1}"
          step="${spec.step ?? 0.01}"
          value="${mixed ? (spec.min ?? 0) : value}"
          disabled="${disabled}"
          oninput="${handleSlide}"
          onchange="${handleSlide}"
        />`}
        <input
          class="field-input field-num"
          type="text"
          inputmode="${spec.kind === 'time' ? 'text' : 'decimal'}"
          autocomplete="off"
          aria-label="${caption || label}"
          placeholder="${mixed ? '—' : ''}"
          value="${typing ? draft : mixed ? '' : formatValue(value, spec)}"
          disabled="${disabled}"
          oninput="${handleInput}"
          onkeydown="${handleKeydown}"
          onkeyup="${handleKeyup}"
          onblur="${handleBlur}"
        />
        ${spec.unit && html`<span class="field-number-unit" aria-hidden="true">${spec.unit}</span>`}
      </span>
    `,
    shadow: false,
  },
});
