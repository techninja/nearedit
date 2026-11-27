/**
 * Find-in-transcript box with a hit counter and previous/next buttons.
 * Holds no state — it reports with bubbling events: `transcript-search`
 * (`{ query }`) and `transcript-step` (`{ direction }`; Enter is next,
 * Shift+Enter previous).
 * @module components/molecules/transcript-find
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TranscriptFindHost
 * @property {string} query
 * @property {number} hitCount - Number of search hits
 * @property {number} hitIndex - The hit being visited, -1 for none
 * @property {boolean} disabled
 */

/** @typedef {TranscriptFindHost & HTMLElement} Host */

/** @param {Host} host @param {Event} event */
function handleQuery(host, event) {
  const query = /** @type {HTMLInputElement} */ (event.target).value;
  dispatch(host, 'transcript-search', { detail: { query }, bubbles: true });
}

/** @param {Host} host @param {number} direction */
function step(host, direction) {
  dispatch(host, 'transcript-step', { detail: { direction }, bubbles: true });
}

/** @param {Host} host @param {KeyboardEvent} event */
function handleKeys(host, event) {
  event.stopPropagation(); // typing never reaches the editor's shortcuts
  if (event.key === 'Enter') step(host, event.shiftKey ? -1 : 1);
}

/** @param {Host} host @param {Event} event */
function handleStep(host, event) {
  step(host, Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.direction));
}

/** @type {import('hybrids').Component<TranscriptFindHost>} */
export default define({
  tag: 'transcript-find',
  query: '',
  hitCount: 0,
  hitIndex: -1,
  disabled: false,
  render: {
    value: ({ query, hitCount, hitIndex, disabled }) => html`
      <label class="transcript-find-box">
        <app-icon name="search" size="sm"></app-icon>
        <input
          type="search"
          class="field-input"
          placeholder="Find"
          aria-label="Find in transcript"
          value="${query}"
          disabled="${disabled}"
          oninput="${handleQuery}"
          onkeydown="${handleKeys}"
        />
        ${query &&
        html`<span class="transcript-find-count" aria-live="polite"
          >${hitCount ? `${hitIndex + 1}/${hitCount}` : 'none'}</span
        >`}
      </label>
      <button
        type="button"
        class="icon-btn"
        data-direction="-1"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled="${!hitCount}"
        onclick="${handleStep}"
      >
        <app-icon name="chevron-up" size="sm"></app-icon>
      </button>
      <button
        type="button"
        class="icon-btn"
        data-direction="1"
        title="Next match (Enter)"
        aria-label="Next match"
        disabled="${!hitCount}"
        onclick="${handleStep}"
      >
        <app-icon name="chevron-down" size="sm"></app-icon>
      </button>
    `,
    shadow: false,
  },
});
