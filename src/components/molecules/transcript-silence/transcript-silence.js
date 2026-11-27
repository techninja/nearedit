/**
 * "Remove silences" form of the transcript panel: the pause threshold and
 * the padding kept around speech, a preview of what would be removed and
 * how much time that saves, and the apply button. Reports with bubbling
 * events: `transcript-silence-change` (`{ threshold?, padding? }`) and
 * `transcript-silence-apply`.
 * @module components/molecules/transcript-silence
 */

import { define, dispatch, html } from 'hybrids';
import { formatSeconds } from '#utils/media/format.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} TranscriptSilenceHost
 * @property {number} threshold - Pauses longer than this are tightened, seconds
 * @property {number} padding - Silence kept each side of speech, seconds
 * @property {{ count?: number, seconds?: number, basis?: string }} plan - `planSilenceRemoval`
 * @property {number} total - Current length of the clip(s), seconds
 * @property {boolean} editable - The clip can be edited (on the timeline, track unlocked)
 */

/** @typedef {TranscriptSilenceHost & HTMLElement} Host */

const SPECS = {
  threshold: { min: 0.2, max: 5, step: 0.1, decimals: 2, unit: 's' },
  padding: { min: 0, max: 0.5, step: 0.01, decimals: 2, unit: 's' },
};
const BASIS = { words: 'word timings', silences: 'detected silences' };

/** @param {Host} host @param {CustomEvent} event */
function handleChange(host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  if (phase === 'cancel' || !Number.isFinite(value)) return;
  dispatch(host, 'transcript-silence-change', { detail: { [name]: value }, bubbles: true });
}

/** @param {Host} host */
function handleApply(host) {
  dispatch(host, 'transcript-silence-apply', { bubbles: true });
}

/**
 * @param {TranscriptSilenceHost} host
 * @returns {string} What applying would do
 */
function preview({ plan, total, editable }) {
  if (!editable) return 'Put this file on the timeline (on an unlocked track) to tighten it.';
  if (plan.basis === 'none')
    return 'This clip has no word timings or detected silences yet — analyse the file first.';
  if (!plan.count) return 'No pause in this clip is longer than the threshold.';
  const after = Math.max(0, total - plan.seconds);
  return `Removes ${plan.count} pause${plan.count === 1 ? '' : 's'} found from ${BASIS[plan.basis]} — saves ${formatSeconds(plan.seconds)} (${formatSeconds(total)} → ${formatSeconds(after)}).`;
}

/** @type {import('hybrids').Component<TranscriptSilenceHost>} */
export default define({
  tag: 'transcript-silence',
  threshold: 0.8,
  padding: 0.1,
  plan: { value: {} },
  total: 0,
  editable: false,
  render: {
    value: (host) => html`
      <div class="transcript-silence" onfield-change="${handleChange}">
        <field-number
          name="threshold"
          label="Pauses over"
          value="${host.threshold}"
          spec="${SPECS.threshold}"
          slider
        ></field-number>
        <field-number
          name="padding"
          label="Keep each side"
          value="${host.padding}"
          spec="${SPECS.padding}"
          slider
        ></field-number>
        <div class="transcript-silence-foot">
          <span class="transcript-silence-preview" role="status">${preview(host)}</span>
          <button
            type="button"
            class="btn btn-primary"
            disabled="${!host.editable || !host.plan.count}"
            onclick="${handleApply}"
          >
            Remove silences
          </button>
        </div>
      </div>
    `,
    shadow: false,
  },
});
