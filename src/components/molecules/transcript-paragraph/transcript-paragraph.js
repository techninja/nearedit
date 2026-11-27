/**
 * One paragraph of a transcript: a timestamp and its words. Each word is a
 * `[data-i]` element (the unit index) styled by its state — in the edit or
 * cut away, playing now, selected, a search hit. Pointer handling is the
 * panel's; this component only draws, and hosts the inline box for
 * correcting a word (`transcript-correct` `{ index, text }`, or
 * `transcript-correct-cancel`).
 * @module components/molecules/transcript-paragraph
 */

import { define, dispatch, html } from 'hybrids';
import { OFF, FOCUS } from '#utils/transcript/usage.js';

/**
 * @typedef {Object} TranscriptParagraphHost
 * @property {import('#utils/transcript/units.js').Unit[]} units - The whole transcript
 * @property {number} first - Index of this paragraph's first unit
 * @property {number} last
 * @property {number[]} states - State of every unit (`unitStates`)
 * @property {boolean} plain - The file is not on the timeline: no cut styling
 * @property {boolean} tint - Tint the words of the focus clip
 * @property {number} selfrom - Selected range, -1 for none
 * @property {number} selto
 * @property {number} current - Unit playing now, -1 for none
 * @property {string} hits - Search hits as `first:last` pairs joined by `;`
 * @property {string} activehit - The hit being visited, as `first:last`
 * @property {number} editing - Unit being corrected, -1 for none
 * @property {string} stamp - Timestamp shown in front
 */

/** @typedef {TranscriptParagraphHost & HTMLElement} Host */

/**
 * @param {string} hits
 * @returns {(index: number) => boolean} Whether a unit lies inside a hit
 */
function hitTest(hits) {
  const ranges = hits ? hits.split(';').map((pair) => pair.split(':').map(Number)) : [];
  return (index) => ranges.some(([a, b]) => index >= a && index <= b);
}

/** @param {Host} host @param {Event} event */
function finishEdit(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (host.editing < 0) return;
  const detail = { index: host.editing, text: input.value };
  dispatch(host, 'transcript-correct', { detail, bubbles: true });
}

/** @param {Host} host @param {KeyboardEvent} event */
function handleEditKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Enter') /** @type {HTMLElement} */ (event.target).blur();
  if (event.key === 'Escape') dispatch(host, 'transcript-correct-cancel', { bubbles: true });
}

/** @param {Host} host @param {number} editing */
function focusEditor(host, editing) {
  if (editing < 0) return;
  requestAnimationFrame(() => {
    const input = host.querySelector('input');
    input?.focus();
    input?.select();
  });
}

/** @type {import('hybrids').Component<TranscriptParagraphHost>} */
export default define({
  tag: 'transcript-paragraph',
  units: { value: [] },
  first: 0,
  last: -1,
  states: { value: [] },
  plain: false,
  tint: false,
  selfrom: -1,
  selto: -1,
  current: -1,
  hits: '',
  activehit: '',
  editing: { value: -1, observe: focusEditor },
  stamp: '',
  render: {
    value: (host) => {
      const { units, first, last, states, plain, tint, selfrom, selto, current, editing } = host;
      const isHit = hitTest(host.hits);
      const isActive = hitTest(host.activehit);
      const words = [];
      for (let i = first; i <= last && i < units.length; i++) {
        if (i === editing) {
          words.push(
            html`<input
              class="field-input transcript-paragraph-edit"
              aria-label="Correct the word"
              size="${Math.max(3, units[i].text.length + 1)}"
              value="${units[i].text}"
              onkeydown="${handleEditKeys}"
              onblur="${finishEdit}"
            />`.key(`edit${i}`),
          );
          continue;
        }
        const classes = {
          'transcript-paragraph-word': true,
          'transcript-paragraph-off': !plain && states[i] === OFF,
          'transcript-paragraph-focus': tint && states[i] === FOCUS,
          'transcript-paragraph-selected': i >= selfrom && i <= selto,
          'transcript-paragraph-current': i === current,
          'transcript-paragraph-hit': isHit(i),
          'transcript-paragraph-hit-active': isActive(i),
        };
        words.push(html`<span class="${classes}" data-i="${i}">${units[i].text}</span>`.key(i));
      }
      return html`<span
          class="transcript-paragraph-stamp"
          data-from="${first}"
          data-to="${last}"
          title="Select this paragraph"
          >${host.stamp}</span
        >
        <span class="transcript-paragraph-words">${words}</span>`;
    },
    shadow: false,
  },
});
